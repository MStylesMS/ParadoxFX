#!/bin/bash

# Simple ParadoxFX Test Script
# Press y/n/k after each command to continue/skip/kinda

wait_input() {
    echo "Works? (y/n/k): "
    read -n 1 response
    echo
    case $response in
        [Nn])
            echo "✗ Failed"
            ;;
        [Kk])
            echo -n "~ Kinda works. Please enter details: "
            read details
            echo "  Details: $details"
            ;;
        *)
            echo "✓ Works"
            ;;
    esac
}

echo "=== ZONE 1 AUDIO TESTS (HDMI0) ==="

echo "Play looping background music"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input

echo "Pause background audio"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"pauseBackground"}'
wait_input
echo "Resume background audio"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"resumeBackground"}'
wait_input

echo "Play a speech file"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playSpeech","audio":"general/Welcome_ParadoxFX.mp3","volume":80}'
wait_input

echo "Play an audio effect"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playSoundEffect","audio":"fx/Cymbal_Short.mp3","volume":80}'
wait_input

echo "Stop background audio"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"stopBackground"}'
wait_input

echo "Play two speech files (queuing test)"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playSpeech","audio":"general/ParadoxFX.mp3"}'
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playSpeech","audio":"general/PFX.mp3"}'
wait_input

echo "Play shorter background music non-looping"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playBackground","audio":"music/Funky_Jazz_Saxophone.mp3","loop":false,"volume":80}'
wait_input

echo "=== ZONE 1 VIDEO TESTS (HDMI0) ==="

echo "Play a video file"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playVideo","video":"defaults/intro_short.mp4","volume":80}'
wait_input

echo "Pause video"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"pauseVideo"}'
wait_input
echo "Resume video"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"resumeVideo"}'
wait_input
echo "Skip video"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"skipVideo"}'
wait_input

echo "Show a photo"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"setImage","image":"defaults/default.png"}'
wait_input

echo "Trigger two video files (queuing test)"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playVideo","video":"defaults/default.mp4"}'
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playVideo","video":"defaults/intro_short.mp4"}'
wait_input

echo "Play looping background music"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playBackgroundMusic","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input

echo "Play a video (audio ducking test)"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"playVideo","video":"defaults/intro_short.mp4","volume":80}'
wait_input

echo "Stop background audio"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"stopBackgroundMusic"}'
wait_input

# Zone 1 screen power tests
echo "Put display to sleep"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"sleepScreen"}'
wait_input
echo "Wake display"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"wakeScreen"}'
wait_input

echo "=== ZONE 2 SCREEN TESTS (HDMI1) ==="

echo "Play a video file"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playVideo","video":"defaults/intro_short.mp4","volume":80}'
wait_input

echo "Pause video"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"pauseVideo"}'
wait_input
echo "Resume video"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"resumeVideo"}'
wait_input
echo "Skip video"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"skipVideo"}'
wait_input

echo "Show a photo"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"setImage","image":"defaults/default.png"}'
wait_input

echo "ZONE 2 Audio Tests - Play looping background music"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input

echo "ZONE 2 Audio Tests - Play a speech file"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playSpeech","audio":"general/Welcome_ParadoxFX_Long.mp3","volume":80}'
wait_input

# Zone 2 speech control tests
echo "Pause speech"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"pauseSpeech"}'
wait_input
echo "Resume speech"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"resumeSpeech"}'
wait_input

# Zone 2 speech skip test: queue two items and skip
echo "Queue two speech files (queuing test)"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playSpeech","audio":"general/PFX_Vocal_Queuing.mp3"}'
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playSpeech","audio":"general/PFX.mp3"}'
wait_input
echo "Skip speech"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"skipSpeech"}'
wait_input

echo "Trigger two video files (queuing test)"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playVideo","video":"defaults/default.mp4"}'
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playVideo","video":"defaults/intro_short.mp4"}'
wait_input

echo "ZONE 2 Audio Tests - Play an audio effect"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"playSoundEffect","audio":"fx/Deep_Braam_Long.mp3","volume":80}'
wait_input

echo "Stop the audio"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"stopBackground"}'
wait_input

echo "=== ZONE 3 DUAL AUDIO TESTS (Both HDMI) ==="
echo "Note: Zone 3 is currently disabled in pfx.ini"

echo "Play looping background music"
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input

echo "Play a speech file"
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"playSpeech","audio":"general/PFX_Vocal_Queuing.mp3","volume":80}'
wait_input

echo "Play an audio effect"
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"playSoundEffect","audio":"fx/Huge_Braam.mp3","volume":80}'
wait_input

echo "Stop background audio"
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"stopBackground"}'
wait_input

echo "Play two speech files (queuing test)"
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"playSpeech","audio":"devices/HDMI_0.mp3"}'
mosquitto_pub -t "paradox/zone3/command" -m '{"command":"playSpeech","audio":"devices/HDMI_1.mp3"}'
wait_input

echo "=== CLEANUP ==="

echo "Stop video - Zone 2"
mosquitto_pub -t "paradox/zone2/command" -m '{"command":"stopVideo"}'
wait_input

echo "=== TESTING COMPLETE ==="

# Test killPfx command to terminate ParadoxFX
echo "Kill ParadoxFX application"
mosquitto_pub -t "paradox/zone1/command" -m '{"command":"killPfx"}'
