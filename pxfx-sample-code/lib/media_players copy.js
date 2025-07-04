//////////////////////////////////////////////////////
//    ______  ___  ______  ___ ______ _______   __  //
//    | ___ \/ _ \ | ___ \/ _ \|  _  \  _  \ \ / /  //
//    | |_/ / /_\ \| |_/ / /_\ \ | | | | | |\ V /   //
//    |  __/|  _  ||    /|  _  | | | | | | |/   \   //
//    | |   | | | || |\ \| | | | |/ /\ \_/ / /^\ \  //
//    \_|   \_| |_/\_| \_\_| |_/___/  \___/\/   \/  //
//--------------------------------------------------//
//                                                  //
// Copyright(c) 2021 Paradox Productions, LLC.      //
//                                                  //
//////////////////////////////////////////////////////
const PROGRAM_FILES = process.env['PROGRAMFILES(X86)'] || process.env.PROGRAMFILES || '';

exports.CHANNEL_VARIABLES = {'DEVICE': 'default', 'CHMASK': '6'};

///// ImageViewer /////
exports.IMG_VIEW = {
  linux: {
    KILL_NAME: "fbi",
    CMD: "sudo",
    ARGS: [
      "/usr/bin/fbi",
      "-a",
      "--noverbose",
      "--nocomments",
      "-T", "1",
    ]
  },
  win32: {
    CMD: "riv.exe",
    ARGS: [
      "-w", "1920",
      "-h", "1080",
      "-p", "19990",
      // "-K", // uncomment it if you want to prevent accidental closing of riv window with an ESC key.
      "-d",
    ]
  }
};

///// VideoPlayer /////
exports.VIDEO = {
  linux: {
    CMD: "cvlc",
    ARGS: [
      "-q",
      "-f",
      "--aout", "alsa",
      "--alsa-audio-device", "$DEVICE",
      "--alsa-audio-channels", "$CHMASK",
      "--vout", "mmal_vout",
      "--no-osd",
      "--video-on-top",
      "--no-video-title-show",
      // "--x11-display", ":0.0",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  },
  win32: {
    CMD: PROGRAM_FILES + "\\VideoLAN\\VLC\\vlc.exe",
    ARGS: [
      "-q",
      "-f",
      "-I", "dummy",
      "--no-osd",
      "--video-on-top",
      "--no-video-title-show",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--audio",
      "--no-volume-save",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  }
};

///// AudioPlayer /////
exports.AUDIO = {
  "omx-passthrough": {
    CMD: "/usr/bin/omxplayer.bin",
    ARGS: [
      "-p",
      "-o", "hdmi",
      "--no-keys",
      "--vol", "0",
    ],
    VOLUME_DEFAULT: 0
  },
  linux: {
    CMD: "cvlc",
    ARGS: [
      "-q",
      "--aout", "alsa",
      "--alsa-audio-device", "$DEVICE",
      "--alsa-audio-channels", "$CHMASK",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  },
  win32: {
    CMD: PROGRAM_FILES + "\\VideoLAN\\VLC\\vlc.exe",
    ARGS: [
      "-q",
      "-I", "dummy",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--audio",
      "--no-volume-save",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  }
};

///// AudioFxPlayer /////
exports.AUDIO_FX = {
  "omx-passthrough": {
    CMD: "/usr/bin/omxplayer.bin",
    ARGS: [
      "-p",
      "-o", "hdmi",
      "--no-keys",
      "--vol", "0",
    ],
    VOLUME_DEFAULT: 0
  },
  linux: {
    CMD: "cvlc",
    ARGS: [
      "-q",
      "--audio",
      "--aout", "alsa",
      "--alsa-audio-device", "$DEVICE",
      "--alsa-audio-channels", "$CHMASK",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  },
  win32: {
    CMD: PROGRAM_FILES + "\\VideoLAN\\VLC\\vlc.exe",
    ARGS: [
      "-q",
      "-I", "dummy",
      "--no-loop",
      "--no-repeat",
      "--play-and-exit",
      "--audio",
      "--no-volume-save",
      "--gain-value", "1.0",
    ],
    VOLUME_DEFAULT: 1.0
  }
};
