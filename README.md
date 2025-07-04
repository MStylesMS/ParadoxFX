# Paradox Effects (PxFx)

## Description

This Node.js module allows a Raspberry Pi or other Linux machines to be used as an video and audio playback device controlled via MQTT.  It will also allow relaying basic commands for other devices such as smart lights and switches.  So in that sense, this is a basic multi-modal media and effect controller.  Where appropriate, it will respond back with status and error messages.  

This module acts like a wrapper around apps and modules.  The three types of FX that cna be controled are:

- Screens: Audio/Video output via media players such as mpv and vlc, and screen buffers such as fbi and feh.
- Lights: Hue and WiZ (future)
- Relays: Zigbee, Z-Wave (future)

The configuration for each of these will be set with the following .conf compatable configuration files:

- pxfx-mqtt-screens.conf = Maps MQTT topics to screens.
- pxfx-alsa.conf = Settings for the asla audio.
- pxfx-mqtt-wiz.conf = Maps MQTT topics to Wiz lights.
- pxfx-mqtt-hue.conf = Maps Mqtt topics to Hue lights.
- pxfx-mqtt-zigbee.conf = Maps MQTT to Zigbee devices.
- pxfx-zwave.conf = Maps MQTT to Z-Wave devices.

There are a few things to note here:

- It is possible to control multiple screens with this module by setting up the MQTT topics for each display in the px-screens.conf file.
- By default, the audio is sent via the HDMi connection to the attached monitors.  To use other audio output devices, those can be configured in the alsa settings.
- For other automation controllers this apps acts as "write only".  Sensors and triggers are not supported.

## Requirements

Somewhere on the 'PATH':

- node.js >= v15.1
- mpv (or other configured audio player)
- fbi (or some other configured frame buffer)
- [riv](https://github.com/royaltm/rust-royal-image-viewer) [optional]

NOTE: currently `riv` is not being used on production due to problems with a Wayland emulation on Raspbian, so this version uses `fbi` instead. The drawback is that it requires passwordless sudo access to run `fbi` executable.

## How to Install

### Basic Setup

(Need info here.)

### Optional

- `dist/armv7-raspbian-linux-gnueabihf/bin/riv` copy to `/usr/bin/riv` and set `chmod +x`.
- `dist/sendcmd.js` - the helper for sending commands to image-switcher, not required, only for testing.
- Disable mosquitto server `sudo systemctl disable mosquitto`
- Disable `lxpanel` by copying `etc/xdg/lxsession/LXDE-pi/autostart` to `/etc/xdg/lxsession/LXDE-pi/`.

### Autostart

_NOTE_: Do not start image-switcher from `/etc/rc.local` because it requires the x-windows system to be up and running.

- install `xterm` (see below)
- copy `dist/image-switcher.desktop` to `$HOME/.config/autostart/image-switcher.desktop`

### Permissions

In order for the `sudo fbi` to be working you need to disable sudo password for the current user:

- copy `dist/etc/sudoers.d/010_paradox-nopasswd` to `/etc/sudoers.d/010_paradox-nopasswd` and set owner to root and permission to 0440

### Channel support

If your site has a surround speaker setup copy one of the alsa pseudodevice definitions:

```
sudo cp etc/alsa/conf.d/80-paradox-CHOICE.conf /etc/alsa/conf.d/
```

- `80-paradox-40speakers.conf` - vanilla configuration for 4 speaker setup
- `80-paradox-51speakers.conf` - vanilla configuration for 51 (6) speaker setup
- `80-paradox-71speakers.conf` - vanilla configuration for 71 (8) speaker setup
- `80-paradox-tlt-chamber3.conf` - IC-TLT chamber 3 configuration

This will provide new ALSA pseudodevices that will allow sound redirection to specific speakers.

### How to Make a System Service

(Add stuff here.)
No other javascript dependencies or files are required.

## Avaliable Commands

For each of the types of devices, the following are the avaliable commands.  

### Screens (and Audio Devices)

- `{"Command":"playVideo","Video":"FileName.mp4"}` - plays immediately or when another video is currently playing queues video file: `FileName.mp4`.
- `{"Command":"setImage","Image":"Picture1.png"}` - displays image: `Picture1.png`.
- `{"Command":"transition","Image":"EndFrame.png","Video":"Transition.mp4"}` - plays immediately or when another video is currently playing queues video file: `Transition.mp4` and when the requested video starts playing sets the displayed image to the `EndFrame.png` file, so the image becomes visible when the video ends.
- `{"Command":"playAudio","Audio":"FileName.mp3"}` - plays immediately or when another audio file is currently playing queues audio file: `FileName.mp3`.
- `{"Command":"playAudioFx","Audio":"SoundFx1.wav"}` - immediately plays audio file: `SoundFx1.wav`.
- `{"Command":"stopVideo"}` - immediately stops the video playback and removes all queued video.
- `{"Command":"stopAudio"}` - immediately stops the audio playback and removes all queued audio clips.
- `{"Command":"stopAllAudioFx"}` - immediately stops all the audio-fx playbacks.
- `{"Command":"stopAll"}` - immediately stops all video, audio and audio-fx playbacks, removes all queued media.
- `{"Command":"getConfig"}` - sends current configuration to the reply topic.
- `{"Command":"videoQueue"}` - sends the names of the currently playing and queued video files to the reply topic.
- `{"Command":"audioQueue"}` - sends the names of the currently playing and queued audio files to the reply topic.
- `{"Command":"displayOff"}` - turns off the display if `PX_DISPLAY_OFF_CMD` is set.
- `{"Command":"displayOn"}` - turns on the display if `PX_DISPLAY_ON_CMD` is set.
- `{"Command":"reboot"}` - reboots the host if `PX_REBOOT_CMD` is set.
- `{"Command":"shutdown"}` - shutdowns the host if `PX_SHUTDOWN_CMD` is set.

Note: In a future update, there will be the ability to specify a list of audio files to be pre-loaded and paused in order to reduce the latency in playing the audio file.  A limited number of these will be avaliable, so they should be used sparingly for sounds that must have as little of a delay between seeing the MQTT message and the sound actually being played.  

### Light Controllers

(These should be copied over from the ESP32 projects that supported light controls.)

## MQTT Topic and Command Structures

For each screen, light, or relay, the following MQTT topics must be defined:

- Device Command Topic - Top level topic for the device where commands are sent (ex. Paradox/Room/Screen1).  While this should normally be unique for each device being controlled, by setting two or more devices to watch the same base topic they will mirror each other (although perfect syncronization is not guaranteed).
- Device Status Topic (automatic) - This topic is automaticlally created and will be a subtopic of the Device Command Topic (ex. Paradox/Room/Screen1/Status) and will report the status, events, and warnings associated with that device.
- Heartbeat Topic* - Typically, this is a topic shared by all the devices in a particular room where key status information is published on a regular basis.  

### Light Effect Players and Topics

(Need to pull these form ESP32 projects and merge with the text below.)

GROUP is the topic for a specific groups of lights, which will be served by whichever controller or controllers are attached to it.  LIGHT is a specific light in a GROUP.  If a command is sent to a GROUP without specifying one or more LIGHTs (multiple allowed) then all lights in the group will respond.  When one or more lights is included in the command, it will be applied to only those lights.

When configuring the pxfx-topics.json file, more than one lighting controller can be used per GROUP, but only one controller per LIGHT.  The mapping is that each LIGHT is configured to use one of the automation controllers, and then that LIGHT is mapped to only one GROUP.  Therefore two LIGHT with the same name but different GROUP will be considered different lights.  

If more than one controller is attached to a single topic, then each LIGHT will respond to whatever commands it understands and ignores the others. However, if "groups" or "rooms" are supported by the external API's then a LIGHT could be a group/room as defined in the external API.

#### Effect Macros and Scripts

With lighting, some external controllers may support "scenes" or "automations" but they are unlikely to match across various models and brands.  Therefore we will support some pre-defined macros and scripts that handle some common automations across multiple types of controllers.  The following will be included, and can be extended by updates to this software.

- FADE = (target color and brightness, trasnition duration)
- BLINK = (target on color and brightness, duration on, duration off, transition duration)
- FLIP = (target color 1, target color 2, etc., duration on, duration off, transition duration)
- DISCO = (target brightness, duration between triggers, transition duration, synced or not)
- FLAME = (target brightness and color, synced or not)
- MORSE = (target on color and brightness, dot duration)

NOTE: "synced or not" refers to whether individual lights in a group are locked to the same brightness and color or are sent different commands.

For Neopixel type devices we will only support them as solid strip or by indivicually addressing single LEDs on a strip.

==================================================================================

## Name

## Description

Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges

On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals

Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation

Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage

Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support

Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap

If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing

State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment

Show your appreciation to those who have contributed to the project.

## License

For open source projects, say how it is licensed.

## Project status

If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
