#!/usr/bin/env node
//////////////////////////////////////////////////////
//    ______  ___  ______  ___ ______ _______   __  //
//    | ___ \/ _ \ | ___ \/ _ \|  _  \  _  \ \ / /  //
//    | |_/ / /_\ \| |_/ / /_\ \ | | | | | |\ V /   //
//    |  __/|  _  ||    /|  _  | | | | | | |/   \   //
//    | |   | | | || |\ \| | | | |/ /\ \_/ / /^\ \  //
//    \_|   \_| |_/\_| \_\_| |_/___/  \___/\/   \/  //
//--------------------------------------------------//
//                                                  //
// Copyright(c) 2019-2020 Paradox Productions, LLC. //
//                                                  //
//////////////////////////////////////////////////////
// ===================================================
// ImageSwitcher (Node.js)
// ---------------------------------------------------
// This app allows pictures and video to be played
// full screen on a remote Pi via MQTT commands.
// ---------------------------------------------------
// Just for testing.
/*

USAGE:

node sendcmd.js playVideo default.png default.mp4
node sendcmd.js setImage default.png
node sendcmd.js transition default.png default.mp4

*/
const mqtt = require("mqtt");

const test = exports.test = function (hosntame) {
  var client = mqtt.connect(`mqtt://${hosntame}`);

  client.on('reconnect', () => console.log('* reconnected'))
  client.on('end', () => console.log('* end'))
  client.on('close', () => console.log('* close'))
  client.on('offline', () => console.log('* offline'))
  client.on('disconnect', (pkt) => console.log('* disconnect %j', pkt))
  client.on('error', (err) => console.error(err))

  const [Command, arg1, arg2, arg3] = process.argv.slice(2);
  const payload = { Command };

  // Updated MQTT commands to use camel case and added logic for new commands
  switch (Command) {
    case 'playVideo':
      payload.Video = arg1;
      payload.Volume = arg2 || 1.0; // Optional volume parameter
      break;
    case 'setImage':
      payload.Image = arg1;
      break;
    case 'transition':
      payload.Image = arg1;
      payload.Video = arg2;
      break;
    case 'playAudio':
      payload.Audio = arg1;
      payload.Volume = arg2 || 1.0; // Optional volume parameter
      break;
    case 'playAudioFX':
      payload.Audio = arg1;
      payload.Type = arg2 || 'one-shot'; // Optional type parameter
      payload.Volume = arg3 || 1.0; // Optional volume parameter
      break;
    case 'clearQueue':
      payload.Command = 'clearQueue';
      break;
    case 'pause':
      payload.Command = 'pause';
      break;
    case 'resume':
      payload.Command = 'resume';
      break;
    case 'skip':
      payload.Command = 'skip';
      break;
    case 'stopAll':
      payload.Command = 'stopAll';
      break;
  }

  const cmdTopic = process.env.PX_COMMAND_TOPIC || "/Paradox/WMH/LargeRoom/Picture/SeanceTable/Commands"
  const rplTopic = process.env.PX_REPLY_TOPIC || "/Paradox/WMH/LargeRoom/Picture/SeanceTable/Reply"

  client.on('connect', function () {
    console.log("* connected");

    client.subscribe(rplTopic + '/#', function (err) {
      if (!err) {
        client.on('message', function (topic, message) {
          if (topic === rplTopic) {
            console.log("GOT REPLY: %s", message.toString());
            client.end();
          }
        })
      }
    })

    client.publish(cmdTopic, JSON.stringify(payload));
  });
}

if (require.main === module) {
  test(process.env.PX_MQTT_SERVER || 'localhost');
}
