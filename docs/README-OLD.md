ImageSwitcher
=============

Prerequisites
-------------

Somewhere on the `PATH`:

* node.js >= v15.1
* cvlc ([VLC Media Player](https://www.videolan.org/index.html), GUI-less command)
* omxplayer
* fbi
* [riv](https://github.com/royaltm/rust-royal-image-viewer) [optional]

NOTE: currently `riv` is not being used on production due to problems with a Wayland emulation on Raspbian, so this version uses `fbi` instead. The drawback is that it requires passwordless sudo access to run `fbi` executable.


HOW TO INSTALL
--------------

You need the following files on production:

* `dist/image-switcher.js` - the image-switcher service, just copy to e.g. `/opt/paradox/`.
* `dist/image-switcher.sh` - the image-switcher startup script, just copy to e.g. `/opt/paradox/`.
* a symlink at `/opt/paradox/node` pointing to the `node` binary executable.
* copy to `/opt/paradox/paradox.sh` one of the files in the `env/$SITE/` directory of this repository.
* (channels) depending on your audio setup copy one of the files to `/etc/alsa/conf.d` from [etc/alsa/conf.d](etc/alsa/conf.d) to setup audio pseudodevices (see below).

### Optional

* `dist/armv7-raspbian-linux-gnueabihf/bin/riv` copy to `/usr/bin/riv` and set `chmod +x`.
* `dist/sendcmd.js` - the helper for sending commands to image-switcher, not required, only for testing.
* Disable mosquitto server `sudo systemctl disable mosquitto`
* Disable `lxpanel` by copying `etc/xdg/lxsession/LXDE-pi/autostart` to `/etc/xdg/lxsession/LXDE-pi/`.

### Autostart

_NOTE_: Do not start image-switcher from `/etc/rc.local` because it requires the x-windows system to be up and running.

* install `xterm` (see below)
* copy `dist/image-switcher.desktop` to `$HOME/.config/autostart/image-switcher.desktop`

### Permissions:

In order for the `sudo fbi` to be working you need to disable sudo password for the current user:

* copy `dist/etc/sudoers.d/010_paradox-nopasswd` to `/etc/sudoers.d/010_paradox-nopasswd` and set owner to root and permission to 0440

### Channel support

If your site has a surround speaker setup copy one of the alsa pseudodevice definitions:

```
sudo cp etc/alsa/conf.d/80-paradox-CHOICE.conf /etc/alsa/conf.d/
```

* `80-paradox-40speakers.conf` - vanilla configuration for 4 speaker setup
* `80-paradox-51speakers.conf` - vanilla configuration for 51 (6) speaker setup
* `80-paradox-71speakers.conf` - vanilla configuration for 71 (8) speaker setup
* `80-paradox-tlt-chamber3.conf` - IC-TLT chamber 3 configuration

This will provide new ALSA pseudodevices that will allow sound redirection to specific speakers.

See also: 

* https://www.alsa-project.org/alsa-doc/alsa-lib/conf.html
* https://www.alsa-project.org/alsa-doc/alsa-lib/pcm_plugins.html

### Example

_IMPORTANT_: run from a regular user (not a root)

This assumes directory `/opt/paradox` already exists and the owner of this directory is the current user `paradox`.

```
install -m 755 image-switcher/dist/image-switcher.sh /opt/paradox/
install -m 644 image-switcher/dist/image-switcher.js /opt/paradox/

# optional
install -m 755 image-switcher/dist/sendcmd.js /opt/paradox/
sudo install -m 755 image-switcher/dist/armv7-raspbian-linux-gnueabihf/bin/riv /usr/bin/riv

# env
# replace $SITE and $PROP with the desired environment:
cp image-switcher/env/$SITE/$PROP.sh /opt/paradox/paradox.sh

# sudoers
sudo install -o root -g root -m 440 image-switcher/dist/etc/sudoers.d/010_paradox-nopasswd /etc/sudoers.d/010_paradox-nopasswd

# node.js
nvm install 15
ln -sf $(which node) /opt/paradox/node

# autostart
sudo apt-get update
sudo apt-get install xterm -y
mkdir -p $HOME/.config/autostart
install -m 644 image-switcher/dist/image-switcher.desktop $HOME/.config/autostart/image-switcher.desktop
```


No other javascript dependencies or files are required.


Configuration
-------------

ImageSwitcher uses the following environment variables for configuration:

* `PX_MQTT_SERVER` is the hostname of the broker to connect to.
* `PX_MQTT_PROTO` can be set to change default "mqtt" protocol: (mqtts tcp tls ws wss).
* `PX_HEARTBEAT_TOPIC` is standard for all props.
* `PX_HEARTBEAT_INTERVAL_MS` is the millisecond interval between heartbeats (10000).
* `PX_WARNINGS_TOPIC` is standard for all props.
* `PX_BASE_TOPIC` is for the client facilty.
* `PX_PROP_LOCATION` is for the game and room.
* `PX_PROP_ID` is the name of the prop.
* `PX_COMMAND_TOPIC` is where the prop commands go.
* `PX_REPLY_TOPIC` is where the prop replies arrive.
* `PX_MEDIA_DIR` is where the media directory appears (default: `/opt/paradox/Media`).
* `PX_DEFAULT_IMAGE` is what will appear on the display at boot and when no image is specified.
* `PX_DEFAULT_VIDEO` will be played when no video is specified.
* `PX_DEFAULT_AUDIO` will be played when no audio is specified.
* `PX_DEFAULT_AUDIO_FX` will be played when no audio FX is specified.
* `PX_VIDEO_VOL` audio gain parameter for video with audio (default: 1.0).
* `PX_AUDIO_AMP` audio volume in millibells for audio files (default: 0).
* `PX_TRANSITION_DELAY_MS` the millisecond delay between starting video and showing the transition image.
* `PX_VIDEO_QUEUE_MAX` a maximum number of videos that can be queued with "playVideo" or "transition" commands
* `PX_AUDIO_QUEUE_MAX` a maximum number of playbacks that can be queued with a "playAudio" command
* `PX_AUDIO_CHANNEL_MAP` a channel map of variable values used by players
* `PX_VIDEO_PLAYER` an identifier of alternative player, currently none available
* `PX_AUDIO_PLAYER` an identifier of alternative player, currently available: 'omx-passthrough'
* `PX_AUDIO_FX_PLAYER` an identifier of alternative player, currently available: 'omx-passthrough'
* `PX_DISPLAY_OFF_CMD` a shell expression for the "displayOff" command
* `PX_DISPLAY_ON_CMD` a shell expression for the "displayOn" command
* `PX_REBOOT_CMD` a "reboot" shell command - include sudo on linux
* `PX_REBOOT_DELAY_MS` the millisecond delay between receiving a command and running it (1000 by default)
* `PX_SHUTDOWN_CMD` a "shutdown" shell command - include sudo on linux
* `PX_SHUTDOWN_DELAY_MS` the millisecond delay between receiving a command and running it (1000 by default)

The audio channel -> device map format:

```
export PX_AUDIO_CHANNEL_MAP="Channel0 DEVICE=device0 CHMASK=4199;Channel1 DEVICE=device1;Channel2 DEVICE=device2"
```

The above example demonstrates how to define channels: `Channel0`, `Channel1` and `Channel2`.

`Channel0` becomes a default channel.


See also [this file](paradox.sh).

The [env](env) directory contains files prepared for several props.


Commands
--------

`image-switcher` awaits the following commands on the MQTT command topic:

* `{"command":"setImage","file":"Picture1.png"}` - displays image: `Picture1.png`.
* `{"command":"transition","image":"EndFrame.png","video":"Transition.mp4"}` - plays immediately or when another video is currently playing queues video file: `Transition.mp4` and when the requested video starts playing sets the displayed image to the `EndFrame.png` file, so the image becomes visible when the video ends.
* `{"command":"playVideo","file":"FileName.mp4"}` - plays immediately or when another video is currently playing queues video file: `FileName.mp4`.
* `{"command":"playAudio","file":"FileName.mp3"}` - plays immediately or when another audio file is currently playing queues audio file: `FileName.mp3`.
* `{"command":"playAudioFx","file":"SoundFx1.wav"}` - immediately plays audio file: `SoundFx1.wav`.
* `{"command":"stopVideo"}` - immediately stops the video playback and removes all queued video.
* `{"command":"stopAudio"}` - immediately stops the audio playback and removes all queued audio clips.
* `{"command":"stopAllAudioFx"}` - immediately stops all the audio-fx playbacks.
* `{"command":"stopAll"}` - immediately stops all video, audio and audio-fx playbacks, removes all queued media.
* `{"command":"getConfig"}` - sends current configuration to the reply topic.
* `{"command":"videoQueue"}` - sends the names of the currently playing and queued video files to the reply topic.
* `{"command":"audioQueue"}` - sends the names of the currently playing and queued audio files to the reply topic.
* `{"command":"displayOff"}` - turns off the display if `PX_DISPLAY_OFF_CMD` is set.
* `{"command":"displayOn"}` - turns on the display if `PX_DISPLAY_ON_CMD` is set.
* `{"command":"reboot"}` - reboots the host if `PX_REBOOT_CMD` is set.
* `{"command":"shutdown"}` - shutdowns the host if `PX_SHUTDOWN_CMD` is set.

The media queues are handled in FIFO order. When the queue is full, the first file queued is being dropped. E.g. if the queue capacity was 5 then only the last 5 files queued would be played back.

Media with the same name will not be added again if they are already in the queue.

Default queue capacity is 1.

Audio and video commands can be extended with an optional `"Channel"` argument to specify a different audio device.
The `Channel` argument must match one of the channels specified with `PX_AUDIO_CHANNEL_MAP`.


Development
-----------

Type `npm install` to populate `node_modules` directory with required dependencies.

To rebuild the distribution files in the `dist` directory use:

```
./build.sh
```


Media utilites
--------------

For playing audio, video and showing images some external utilities are being used.

This can be changed in `lib/media_players.js` by modifying properties:

* `{media}.{platform}.CMD` - a path to an external command.
* `{media}.{platform}.ARGS` - an argument list.
* `{media}.{platform}.VOLUME_DEFAULT` - default media player volume.
* `IMG_VIEW.linux.KILL_NAME` - an optional name of the process to kill before showing a new image.

Where `{media}` is IMG_VIEW, VIDEO, AUDIO and AUDIO_FX.

The last argument for VIDEO, AUDIO and AUDIO_FX should be an audio gain volume level.


Testing
-------

Open 3 consoles:

1. On the 1st run mqtt monitor:

```
mosquitto_sub -t '#' -v
```

2. On the 2nd run the app in the foreground so you'll see the log messages:

```
node /opt/paradox/image_switcher
```

3. On the 3rd use sendcmd.js to send commands

```
# This will display a still image
node sendcmd.js setImage WMH-WaterTorture-1-Plain.png

# This will play two transitions one after another without gaps
node sendcmd.js transition WMH-WaterTorture-3-Hint-Image.png WMH-WaterTorture-2-Transtion-In.mp4 && node sendcmd.js transition WMH-WaterTorture-1-Plain.png WMH-WaterTorture-4-Transition-Out.mp4

# Same for milk can transition
node sendcmd.js setImage WMH-MilkCan-1-Plain-Image.png

node sendcmd.js transition WMH-MilkCan-3-Hint-Image.png WMH-MilkCan-2-Transition-In.mp4 && node sendcmd.js transition WMH-MilkCan-1-Plain-Image.png WMH-MilkCan-4-Transition-Out.mp4


# Chains transition
node sendcmd.js setImage WMH-Balls-Chains-1-Plain-Image.png

node sendcmd.js transition WMH-Balls-Chains-3-Hint-Image.png WMH-Balls-Chains-2-Transition-In.mp4 && node sendcmd.js transition WMH-Balls-Chains-1-Plain-Image.png WMH-Balls-Chains-4-Transition-Out.mp4


# Park transition
node sendcmd.js setImage WMH-Park-1-Plain.png

node sendcmd.js transition WMH-Park-3-Hint.png WMH-Park-2-Transition-In.mp4 && node sendcmd.js transition WMH-Park-1-Plain.png WMH-Park-4-Transition-Out.mp4


# Just some videos and audio
node sendcmd.js playVideo Stereoscope_9-20.mp4
node sendcmd.js playAudio cheers.wav
node sendcmd.js playAudio generator.wav
node sendcmd.js playVideo success.mp4

# Audio FX
node sendcmd.js playAudioFx cheers.wav &
node sendcmd.js playAudioFx vault.wav &

# Stop all now and remove all queued items
node sendcmd.js stopAll

# Stop video now and remove all queued items
node sendcmd.js stopVideo

# Stop audio now and remove all queued items
node sendcmd.js stopAudio

# Stop all audioFx being played
node sendcmd.js stopAllAudioFx
```

THE LIST OF FILES:

```
cheers.wav
default_fx.wav
default.mp4
default.png
default.wav
generator.wav
image1.png
image3.png
Part-1.mp4
Part-2.mp4
prime.mp3
Stereoscope_9-20.mp4
success.mp4
vault.wav
video2.mp4
video4.mp4
WMH-Balls-Chains-1-Plain-Image.png
WMH-Balls-Chains-2-Transition-In.mp4
WMH-Balls-Chains-3-Hint-Image.png
WMH-Balls-Chains-4-Transition-Out.mp4
WMH-MilkCan-1-Plain-Image.png
WMH-MilkCan-2-Transition-In.mp4
WMH-MilkCan-3-Hint-Image.png
WMH-MilkCan-4-Transition-Out.mp4
WMH-Park-1-Plain.png
WMH-Park-2-Transition-In.mp4
WMH-Park-3-Hint.png
WMH-Park-4-Transition-Out.mp4
WMH-Seance-image.png
WMH-Seance-video.mp4
WMH-WaterTorture-1-Plain.png
WMH-WaterTorture-2-Transtion-In.mp4
WMH-WaterTorture-3-Hint-Image.png
WMH-WaterTorture-4-Transition-Out.mp4
```


# MQTT examples

```
mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/stereoscope/command -m '{"command":"playVideo","file":"Stereoscope_9-20.mp4"}'

mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/large-room/pictures/milk-can/command -m '{"command": "setImage", "file": "WMH-MilkCan-1-Plain-Image.png"}'

mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/large-room/pictures/milk-can/command -m '{"command": "transition", "image": "WMH-MilkCan-3-Hint-Image.png", "video": "WMH-MilkCan-2-Transition-In.mp4"}'

mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/large-room/pictures/milk-can/command -m '{"command": "transition", "image": "WMH-MilkCan-1-Plain-Image.png", "video": "WMH-MilkCan-4-Transition-Out.mp4"}'

mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/large-room/audio/command -m '{"command":"playAudio","file":"generator.wav"}'

mosquitto_pub -h 192.168.8.101 -t /paradox/wmh/large-room/audio/command -m '{"command":"playAudioFx","file":"cheers.wav"}'
```

# Proposed Install Script

__NOTE__: transfer `/opt/paradox/Media/`.

```
ENV_SCRIPT=<__________>.sh
git clone https://bitbucket.org/paradoxrooms/image-switcher.git

sudo apt-get update
cd image_switcher
git pull
git submodule update --recursive
cd ..
cp image-switcher/dist/image-switcher.js /opt/paradox/
cp image-switcher/dist/image-switcher.sh /opt/paradox/
sudo cp image-switcher/dist/armv7-raspbian-linux-gnueabihf/bin/riv /usr/bin/riv
sudo chmod +x /usr/bin/riv
sudo apt-get install xterm -y
sudo systemctl disable mosquitto
sudo mkdir -p /opt/paradox
sudo chown paradox:users /opt/paradox
install -m 755 image-switcher/dist/image-switcher.sh /opt/paradox/
install -m 644 image-switcher/dist/image-switcher.js /opt/paradox/
install -m 755 image-switcher/dist/sendcmd.js /opt/paradox/
sudo install -m 755 image-switcher/dist/armv7-raspbian-linux-gnueabihf/bin/riv /usr/bin/riv
cp image-switcher/env/$ENV_SCRIPT /opt/paradox/paradox.sh
sudo install -o root -g root -m 440 image-switcher/dist/etc/sudoers.d/010_paradox-nopasswd /etc/sudoers.d/010_paradox-nopasswd
sudo cp image-switcher/etc/xdg/lxsession/LXDE-pi/autostart /etc/xdg/lxsession/LXDE-pi/
nvm install 15
ln -sf $(which node) /opt/paradox/node
mkdir -p $HOME/.config/autostart
install -m 644 image-switcher/dist/image-switcher.desktop $HOME/.config/autostart/image-switcher.desktop
sudo reboot now
```

NOTE: On Raspberry Pi 4 the microHDMI port nearest to the power supply needs to be used.


### Alan's Proposed Bash Script for Instructions

Copy media files from GM desktop folder "Media" to /opt/paradox/media

```
#! /bin/bash
sudo su
mkdir /etc/paradox
chown -R paradox:users /etc/paradox
cat <<EOF > /etc/rc.local
# execute the startup script in the home dirctory
/home/pi/startup.sh
exit 0
EOF
exit
cat <<EOF > /home/pi/startup.sh
#enable if gpio is needed
#while true
#do
#gpio-cpp /etc/paradox/gpio-config.json
#sleep 1
#done
EOF
chmod +x /home/pi/startup.sh
. /opt/paradox/Media/paradox.sh
cd /opt/paradox/Media
ln -s WMH-MilkCan-1-Plain-Image.png default.png
ln -s WMH-MilkCan-2-Transition-In.mp4 default.mp4
DISPLAY=:0 pcmanfm --set-wallpaper /opt/paradox/Media/default.png
```
