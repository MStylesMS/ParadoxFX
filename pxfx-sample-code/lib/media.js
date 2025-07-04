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
// media.js: Media tools.
const path = require('path');
const { EventEmitter } = require('events');
const { CHANNEL_VARIABLES
      , IMG_VIEW, VIDEO, AUDIO, AUDIO_FX } = require('./media_players');
const { isStringNonEmpty, parseNumberOr, parseChannelMap } = require('./utils');
const { execSubProc, killAll } = require('./subproc');

const MEDIA_CONFIG = {
  media_dir: "/opt/paradox/Media",
  default_image: "default.png",
  default_video: "default.mp4",
  default_audio_fx: "default_fx.wav",
  default_audio: "default.wav",
  video_vol: "1.0",
  audio_amp: "0",
  video_queue_max: "1",
  audio_queue_max: "1",
  audio_channel_map: "Default"
  // video_player
  // audio_player
  // audio_fx_player
  // display_off_cmd
  // display_on_cmd
};

const platform = process.platform;

/////////////////////////
/// Media API classes ///
/////////////////////////

class SimpleMedia {
  constructor(cfg, command, cmdArgs) {
    const config = this.config = Object.assign({}, MEDIA_CONFIG, cfg);
    for (let param in MEDIA_CONFIG) {
      if (!isStringNonEmpty(config[param])) {
        throw new Error(`${this.constructor}: configuration failed, option: ${param} is not set`);
      }
    }
    // channel -> (variable -> value)
    this.channelMaps = parseChannelMap(this.config.audio_channel_map, CHANNEL_VARIABLES);
    for (let channel of this.channelMaps.keys()) {
      this.defaultChannel = channel;
      break;
    }
    if (!this.defaultChannel) {
      throw new Error(`${this.constructor}: configuration failed, no channels found`);
    }
    this.command = command;
    this.cmdArgs = cmdArgs;
  }

  mediaPath(media) {
    return path.resolve(this.config.media_dir, media);
  }

  mediaName(mediaPath) {
    return path.relative(this.config.media_dir, mediaPath);
  }

  spawn(media, channel) {
    channel || (channel = this.defaultChannel);
    const maps = this.channelMaps.get(channel);
    if (!maps) {
      throw new Error("Unknown channel: " + channel);
    }
    const mediaPath = this.mediaPath(media);
    const args = this.cmdArgs.map(arg => {
      var res = maps.get(arg);
      return (res == null ? arg : res);
    });
    const subproc = execSubProc(this.command, args, mediaPath);
    subproc.mediaName = this.mediaName(mediaPath);
    subproc.mediaPath = mediaPath;
    subproc.channel = channel;
    return subproc;
  }
}

class OneShotMedia extends SimpleMedia {
  constructor(cfg, command, cmdArgs) {
    super(cfg, command, cmdArgs);
    this.playing = new Set();
  }

  stop() {
    var subproc;
    for (let subproc of this.playing.values()) {
      subproc.kill();
    }
    this.playing.clear();
  }

  spawn(media, channel) {
    const subproc = super.spawn(media, channel);
    this.playing.add(subproc);
    subproc.catch((_e)=>{}).finally(() => this.playing.delete(subproc));
    return subproc.then(res => {
      if (res !== 0) {
        throw new Error("Command failed with: " + res)
      }
      return subproc.mediaName;
    })
  }
}

const DEFAULT_MAX_QUEUED = 1;

class QueuedMedia extends SimpleMedia {
  constructor(cfg, command, cmdArgs) {
    super(cfg, command, cmdArgs);
    this.queue = new Map(); // EventEmitter -> () => SubProcess
    this.pendingMedia = new Set(); // pending media paths for de-duplicating
    this.playing = null; // SubProcess
    this.maxQueued = DEFAULT_MAX_QUEUED;
  }

  get playingMediaName() {
    return this.playing && this.playing.mediaName;
  }

  queuedMedia() {
    var queue = []
      , mediaName = this.playingMediaName;
    if (mediaName) {
      queue.push(mediaName);
      for (let {mediaPath} of this.queue.values()) {
        queue.push(this.mediaName(mediaPath));
      }
    }
    return queue;
  }

  setQueueMax(maxQueued) {
    maxQueued = parseNumberOr(maxQueued, DEFAULT_MAX_QUEUED);
    this.maxQueued = maxQueued < 0 ? DEFAULT_MAX_QUEUED : maxQueued;
  }

  stop() {
    if (this.playing) this.playing.kill();
    for (let emitter of this.queue.keys()) {
      dropEmitter(emitter);
    }
    this.queue.clear();
    this.pendingMedia.clear();
  }

  play(media, channel) {
    let emitter = new EventEmitter();
    channel || (channel = this.defaultChannel);

    const starter = () => {
      const subp = this.spawn(media, channel);
      subp.subprocess.on('spawn', () => emitDefensively(emitter, 'start', subp.mediaName));
      subp.promise.then(
        res => emitter.emit('end', res, subp.mediaName),
        err => emitter.emit('error', err, subp.mediaName)
      )
      .catch(err => {
        console.error("INTERNAL ERROR while handling event from the media queue:");
        console.error(err);
      })
      .finally(() => {
        emitDefensively(emitter, 'done');
        if (this.playing === subp) {
          this.playing = null;
          for (let [emitter, starter] of this.queue.entries()) {
            this.queue.delete(emitter);
            this.playing = starter();
            break;
          }
        }
      });

      return subp;
    };

    if (this.playing) {
      // no dupes
      let mediaPath = this.mediaPath(media);
      if (this.pendingMedia.has(mediaPath) || this.maxQueued <= 0) {
        setImmediate(() => dropEmitter(emitter));
        return emitter;
      }
      else {
        this._registerMediaPath(mediaPath, emitter);
      }

      // drop outstanding queue items
      if (this.queue.size >= this.maxQueued) {
        for (let emitter of this.queue.keys()) {
          this.queue.delete(emitter);
          dropEmitter(emitter);
          if (this.queue.size < this.maxQueued) {
            break;
          }
        }
      }
      // add to queue
      starter.mediaPath = mediaPath;
      starter.channel = channel;
      this.queue.set(emitter, starter);
    }
    else {
      // play now
      this.pendingMedia.clear();
      this.playing = starter();
      this._registerMediaPath(this.playing.mediaPath, emitter);
    }

    return emitter;
  }

  _registerMediaPath(mediaPath, emitter) {
    this.pendingMedia.add(mediaPath);
    emitter.on('done', () => this.pendingMedia.delete(mediaPath));
  }
}

function dropEmitter(emitter) {
  emitDefensively(emitter, 'drop');
  emitDefensively(emitter, 'done');
}

function emitDefensively(emitter, event, ...args) {
  try {
    emitter.emit(event, ...args);
  } catch(err) {
    console.error(`INTERNAL ERROR while handling '${event}' event from the media queue:`);
    console.error(err);
  }
}

///////////////////////
/// Implementations ///
///////////////////////


///// ImageViewer /////
const IMG_VIEW_KILL_NAME = IMG_VIEW[platform].KILL_NAME;
const IMG_VIEW_CMD = IMG_VIEW[platform].CMD;
const IMG_VIEW_ARGS = IMG_VIEW[platform].ARGS;

class ImageViewer extends OneShotMedia {
  constructor(cfg) {
    super(cfg, IMG_VIEW_CMD, IMG_VIEW_ARGS);
  }

  mediaPath(media) {
    return super.mediaPath(media || this.config.default_image);
  }

  show(image) {
    return IMG_VIEW_KILL_NAME ? killAll(IMG_VIEW_KILL_NAME)
                                .then(() => this.spawn(image))
                              : this.spawn(image);
  }
}

///// AudioFxPlayer /////

const AUDIO_FX_CMD = AUDIO_FX[platform].CMD;
const AUDIO_FX_ARGS = AUDIO_FX[platform].ARGS;
const AUDIO_FX_VOLUME_DEFAULT = AUDIO_FX[platform].VOLUME_DEFAULT;

class AudioFxPlayer extends OneShotMedia {
  constructor(cfg) {
    var cmd = AUDIO_FX_CMD
      , args = AUDIO_FX_ARGS
      , volume = AUDIO_FX_VOLUME_DEFAULT;

    if (cfg.audio_fx_player) {
      const PLAYER = AUDIO_FX[cfg.audio_fx_player];
      if (PLAYER == null) {
        throw new Error("Unknown AUDIO FX PLAYER: " + cfg.audio_fx_player);
      }
      cmd = PLAYER.CMD;
      args = PLAYER.ARGS;
      volume = PLAYER.VOLUME_DEFAULT;
    }

    super(cfg, cmd, args);
    this.defaultVolume = volume;
    this.setVolume(this.config.audio_amp);
  }

  setVolume(vol) {
    this.cmdArgs[this.cmdArgs.length - 1] = String(parseNumberOr(vol, this.defaultVolume));
  }

  mediaPath(media) {
    return super.mediaPath(media || this.config.default_audio_fx);
  }

  play(audio, channel) {
    return this.spawn(audio, channel);
  }
}

///// VideoPlayer /////

const VIDEO_CMD = VIDEO[platform].CMD;
const VIDEO_ARGS = VIDEO[platform].ARGS;
const VIDEO_VOLUME_DEFAULT = VIDEO[platform].VOLUME_DEFAULT;

class VideoPlayer extends QueuedMedia {
  constructor(cfg) {
    var cmd = VIDEO_CMD
      , args = VIDEO_ARGS
      , volume = VIDEO_VOLUME_DEFAULT;

    if (cfg.video_player) {
      const PLAYER = VIDEO[cfg.video_player];
      if (PLAYER == null) {
        throw new Error("Unknown VIDEO PLAYER: " + cfg.video_player);
      }
      cmd = PLAYER.CMD;
      args = PLAYER.ARGS;
      volume = PLAYER.VOLUME_DEFAULT;
    }

    super(cfg, cmd, args);
    this.defaultVolume = volume;
    this.setVolume(this.config.video_vol);
    this.setQueueMax(this.config.video_queue_max);
  }

  setVolume(vol) {
    this.cmdArgs[this.cmdArgs.length - 1] = String(parseNumberOr(vol, this.defaultVolume));
  }

  mediaPath(media) {
    return super.mediaPath(media || this.config.default_video);
  }
}

///// AudioPlayer /////

const AUDIO_CMD = AUDIO[platform].CMD;
const AUDIO_ARGS = AUDIO[platform].ARGS;
const AUDIO_VOLUME_DEFAULT = AUDIO[platform].VOLUME_DEFAULT;

class AudioPlayer extends QueuedMedia {
  constructor(cfg) {
    var cmd = AUDIO_CMD
      , args = AUDIO_ARGS
      , volume = AUDIO_VOLUME_DEFAULT;

    if (cfg.audio_player) {
      const PLAYER = AUDIO[cfg.audio_player];
      if (PLAYER == null) {
        throw new Error("Unknown AUDIO PLAYER: " + cfg.audio_player);
      }
      cmd = PLAYER.CMD;
      args = PLAYER.ARGS;
      volume = PLAYER.VOLUME_DEFAULT;
    }

    super(cfg, cmd, args);
    this.defaultVolume = volume;
    this.setVolume(this.config.video_vol);
    this.setQueueMax(this.config.audio_queue_max);
  }

  setVolume(vol) {
    this.cmdArgs[this.cmdArgs.length - 1] = String(parseNumberOr(vol, this.defaultVolume));
  }

  mediaPath(media) {
    return super.mediaPath(media || this.config.default_audio);
  }
}

exports.MEDIA_CONFIG = MEDIA_CONFIG;
exports.OneShotMedia = OneShotMedia;
exports.AudioFxPlayer = AudioFxPlayer;
exports.ImageViewer = ImageViewer;
exports.VideoPlayer = VideoPlayer;
exports.AudioPlayer = AudioPlayer;
