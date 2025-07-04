//////////////////////////////////////////////////////
//    ______  ___  ______  ___ ______ _______   __  //
//    | ___ \/ _ \ | ___ \/ _ \|  _  \  _  \ \ / /  //
//    | |_/ / /_\ \| |_/ / /_\ \ | | | | | |\ V /   //
//    |  __/|  _  ||    /|  _  | | | | | | |/   \   //
//    | |   | | | || |\ \| | | | |/ /\ \_/ / /^\ \  //
//    \_|   \_| |_/\_| \_\_| |_/___/  \___/\/   \/  //
//--------------------------------------------------//
//                                                  //
// Copyright(c) 2019-2021 Paradox Productions, LLC. //
//                                                  //
//////////////////////////////////////////////////////
// ===================================================
// ImageSwitcher (Node.js)
// ---------------------------------------------------
// This app allows pictures and video to be played
// full screen on a remote Pi via MQTT commands.
// ---------------------------------------------------
// broker.js: Task broker.
/*
Usage:
paradox = new Paradox(config);
paradox.onCommand('playVideo', ({Video}) => {
  paradox.setHeartbeatStatus('now playing: ' + Video);
  paradox.reply("just played: %s", Video);
});
paradox.heartbeatStart(10000);
paradox.heartbeatStop();
paradox.startListening();
paradox.end();
*/
const os = require('os');
const fs = require('fs');
const util = require('util');
const { EventEmitter } = require('events');
const mqtt = require('mqtt');
const { isStringNonEmpty } = require('./utils');
const readFile = util.promisify(fs.readFile);

const MIN_HEARTBEAT_INTERVAL = 2000; // 2 seconds
const BROKER_CONFIG = {
  mqtt_server: "localhost",
  mqtt_proto: "mqtt",
  heartbeat_topic: "",
  warnings_topic: "",
  base_topic: "",
  prop_location: "/",
  prop_id: "",
  command_topic: "",
  reply_topic: "",
  heartbeat_interval_ms: "10000",
};

class ImageSwitcherBroker {
  constructor(cfg) {
    const config = this.config = Object.assign({}, BROKER_CONFIG, cfg);
    for (let param in BROKER_CONFIG) {
      if (!isStringNonEmpty(config[param])) {
        throw new Error(`ImageSwitcherBroker: configuration failed, option: ${param} is not set`);
      }
    }
    this.mqtt = mqtt.connect(`${config.mqtt_proto}://${config.mqtt_server}`, {
      reconnectPeriod: 5000,
    });
    this.prop = {
      id: config.prop_id,
      location: config.prop_location,
      get path() {
        return this.location + this.id;
      }
    }
    this.commandHandlers = new EventEmitter();
    this._listening = false;
    this._hBeatHook = null;
    this._hBeatIntervalMs = Math.max(config.heartbeat_interval_ms|0, MIN_HEARTBEAT_INTERVAL);
    this._status = 'idle';

    this.mqtt.on('error', err => {
      this.logError("MQTT Error: " + err.message);
      // this.mqtt.end();
    })
    .on('connect', () => {
      this.logError("MQTT connected");
      // try to subscribe now if previously failed
      if (this._listening) this.startListening();
    })
    .on('reconnect', () => this.logError("MQTT reconnecting"))
    .on('close', () => this.logError("MQTT closed"))
  }

  /**
    * Send a message to a reply topic.
    * @param message {string|Object} - a reply message to send
    * @param [topicStr] {string} - an optional mqtt topic on which the message was received
   **/
  reply(message, topicStr) {
    var messageStr = 'string' === typeof message
                   ? this.prop.path + (topicStr ? " @ " + topicStr : "")  + ": " + message
                   : JSON.stringify(Object.assign({path: this.prop.path}, message));
    this.mqtt.publish(this.config.reply_topic, messageStr);
    return this;
  }

  /**
    * Subscribes a callback to a specific command.
   **/
  onCommand(command, callback) {
    this.commandHandlers.on(command, callback);
    return this;
  }

  /**
    * (Re-)starts emitting hearbeats with the given `interval` in milliseconds.
    * @param [interval] {number} - heartbeat interval in ms
   **/
  heartbeatStart(interval) {
    clearInterval(this._hBeatHook);
    if (interval == null) {
      interval = this._hBeatIntervalMs;
    }
    interval |= 0;
    if (interval < MIN_HEARTBEAT_INTERVAL) {
      interval = MIN_HEARTBEAT_INTERVAL;
    }
    this._hBeatIntervalMs = interval;
    this._hBeatHook = setInterval(() => this.emitHeartbeat(), interval);
    return this;
  }

  /**
    * Stop emitting hearbeats.
   **/
  heartbeatStop() {
    clearInterval(this._hBeatHook);
    return this;
  }

  /**
    * Sets the current heartbeat status. Pass `sendNow` as `true` to send the heartbeat immediately.
    * @param status {string}
    * @param [sendNow] {boolean}
   **/
  setHeartbeatStatus(status, sendNow) {
    this._status = String(status || 'idle');
    if (sendNow) {
      this.heartbeatStart(this._hBeatIntervalMs);
      emitHeartbeat();
    }
    return this;
  }

  /**
    * Subscribes to a command channel and starts listening to command messages.
   **/
  startListening() {
    if (this._listening && this._listening !== 'failed') return;
    this._listening = 'pending';
    const command_topic = this.config.command_topic;
    const topic_sub = command_topic + '/#';
    this.mqtt.subscribe(topic_sub, (err) => {
      if (err) {
        this._listening = 'failed';
        this.logError(`couldn't subscribe to the topic: ${topic_sub}`);
      }
      else {
        this._listening = true;
        this.mqtt.on('message', (topic, message) => {
          const messageStr = message.toString();
          if (topic === command_topic) {
            try { // {"Command":"transition", "Image":"image1.png", "Video":"video1.mp4"}
              const data = JSON.parse(messageStr);
              const { Command } = data;
              if (this.commandHandlers.listenerCount(Command)) {
                this.commandHandlers.emit(Command, data);
              }
              else {
                this.logError("unknown command: " + Command);
                this.emitWarning("received unknown command: " + Command);
              }
            } catch(err) {
              this.logError("command message error: " + err.message);
              this.emitWarning("error while processing command message:", err);
            }
          }
        });

        this.reply("subscribed", command_topic);
      }
    });
    return this;
  }

  /**
    * Shuts it all down.
   **/
  end() {
    this.heartbeatStop();
    this.commandHandlers.removeAllListeners()
    if (this.mqtt) {
      this.mqtt.end(true);
      this.mqtt = null;
    }
  }

  /**
    * Sends a `warning` message to a warning topic.
    * @param warning {string} - a warning message
    * @param [err] {Error} - an optional error source
   **/
  emitWarning(warning, err) {
    var message = this.prop.path + " " + warning;
    if (err) {
      message = message + " " + err.message;
    }
    this.mqtt.publish(this.config.warnings_topic, message);
  }

  /**
    * Sends a single heartbeat message.
   **/
  async emitHeartbeat() {
    let hbmsg = await heartbeatPayload();
    hbmsg.id = this.prop.path;
    hbmsg.status = this._status;
    const mqtt = this.mqtt;
    mqtt && mqtt.publish(this.config.heartbeat_topic, JSON.stringify(hbmsg));
  }

  /**
    * Logs formatted error message to stderr.
   **/
  logError(message) {
    console.error("%s: %s, %s", new Date().toLocaleString(), this.prop.id, message);
  }

  /**
    * Logs formatted info message to stdout.
   **/
  logInfo(message) {
    console.log("%s: %s, %s", new Date().toLocaleString(), this.prop.id, message);
  }
}

exports.ImageSwitcherBroker = ImageSwitcherBroker;

function findIp(ipprefix) {
  const netifs = os.networkInterfaces();
  for (let nif in netifs) {
    for (let {address} of netifs[nif]) {
      if (address.startsWith(ipprefix)) {
        return address;
      }
    }
  }
}

async function measureTemp() {
  if (os.platform() === 'linux' && os.arch() === 'arm') {
    let temp = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return parseInt(temp) / 1000;
  }
}

async function heartbeatPayload() {
  const ip = findIp('192.168.')
      , ts = os.uptime() * 1000
      , mfree = os.freemem()
      , temp = await measureTemp()
      , load = os.loadavg()[0];
  return {type: "IMSW", ip, ts, mfree, temp, load};
}
