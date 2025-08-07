#!/bin/bash

# Simple ParadoxFX Test Script
# Press y/n/k/s after each command to continue/fail/kinda/skip

# Initialize tracking variables
step_counter=0
declare -A test_results
declare -A test_descriptions

wait_input() {
    local description="$1"
    ((step_counter++))
    
    test_descriptions[$step_counter]="$description"
    
    echo "Step $step_counter: $description"
    echo "Works? (y/n/k/s): "
    read -n 1 response
    echo
    case $response in
        [Nn])
            echo "✗ Failed"
            test_results[$step_counter]="FAILED"
            ;;
        [Kk])
            echo -n "~ Kinda works. Please enter details: "
            read details
            echo "  Details: $details"
            test_results[$step_counter]="KINDA: $details"
            ;;
        [Ss])
            echo "⏭ Skipped"
            test_results[$step_counter]="SKIPPED"
            ;;
        *)
            echo "✓ Works"
            test_results[$step_counter]="PASSED"
            ;;
    esac
}

show_summary() {
    local log_file="test/manual/test-all.log"
    
    # Create summary output
    local summary_output=""
    summary_output+="=== TEST SUMMARY ===\n"
    summary_output+="Test run: $(date)\n"
    summary_output+="Issues found (non-passing tests):\n"
    summary_output+="\n"
    
    local issues_found=false
    for i in $(seq 1 $step_counter); do
        if [[ "${test_results[$i]}" != "PASSED" && "${test_results[$i]}" != "SKIPPED" ]]; then
            summary_output+="Step $i: ${test_descriptions[$i]}\n"
            summary_output+="  Result: ${test_results[$i]}\n"
            summary_output+="\n"
            issues_found=true
        fi
    done
    
    if [ "$issues_found" = false ]; then
        summary_output+="No issues found! All tests passed or were skipped.\n"
    fi
    
    summary_output+="\n"
    summary_output+="Total tests: $step_counter\n"
    local passed=$(printf '%s\n' "${test_results[@]}" | grep -c "PASSED")
    local failed=$(printf '%s\n' "${test_results[@]}" | grep -c "FAILED")
    local kinda=$(printf '%s\n' "${test_results[@]}" | grep -c "KINDA:")
    local skipped=$(printf '%s\n' "${test_results[@]}" | grep -c "SKIPPED")
    
    summary_output+="Passed: $passed, Failed: $failed, Kinda: $kinda, Skipped: $skipped\n"
    
    # Display to console
    echo
    echo -e "$summary_output"
    
    # Write to log file
    echo -e "$summary_output" > "$log_file"
    echo "Test summary written to: $log_file"
}

echo "=== ZONE 1 AUDIO TESTS (HDMI0) ==="

echo "Play looping background music"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input "Zone 1: Play looping background music"

echo "Pause background audio"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"pauseBackground"}'
wait_input "Zone 1: Pause background audio"
echo "Resume background audio"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"resumeBackground"}'
wait_input "Zone 1: Resume background audio"

echo "Play a speech file"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playSpeech","audio":"general/Welcome_ParadoxFX.mp3","volume":80}'
wait_input "Zone 1: Play speech file"

echo "Play an audio effect"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playSoundEffect","audio":"fx/Cymbal_Short.mp3","volume":80}'
wait_input "Zone 1: Play audio effect"

echo "Stop background audio"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"stopBackground"}'
wait_input "Zone 1: Stop background audio"

echo "Play two speech files (queuing test)"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playSpeech","audio":"general/ParadoxFX.mp3"}'
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playSpeech","audio":"general/PFX.mp3"}'
wait_input "Zone 1: Speech queuing test (two files)"

echo "Play shorter background music non-looping"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playBackground","audio":"music/Funky_Jazz_Saxophone.mp3","loop":false,"volume":80}'
wait_input "Zone 1: Play non-looping background music"

echo "=== ZONE 1 VIDEO TESTS (HDMI0) ==="

echo "Play a video file"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playVideo","video":"defaults/intro_short.mp4","volume":80}'
wait_input "Zone 1: Play video file"

echo "Pause video"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"pauseVideo"}'
wait_input "Zone 1: Pause video"
echo "Resume video"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"resumeVideo"}'
wait_input "Zone 1: Resume video"
echo "Skip video"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"skipVideo"}'
wait_input "Zone 1: Skip video"

echo "Show a photo"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"setImage","image":"defaults/default.png"}'
wait_input "Zone 1: Show photo"

echo "Trigger two video files (queuing test)"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playVideo","video":"defaults/default.mp4"}'
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playVideo","video":"defaults/intro_short.mp4"}'
wait_input "Zone 1: Video queuing test (two files)"

echo "Play looping background music"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input "Zone 1: Play background music for ducking test"

echo "Play a video (audio ducking test)"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"playVideo","video":"defaults/default.mp4","volume":80}'
wait_input "Zone 1: Audio ducking test (video over background music)"

echo "Stop background audio"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"stopBackground"}'
wait_input "Zone 1: Stop background music"

# Zone 1 screen power tests
echo "Put display to sleep"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"sleepScreen"}'
wait_input "Zone 1: Put display to sleep"
echo "Wake display"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"wakeScreen"}'
wait_input "Zone 1: Wake display"

echo "=== ZONE 2 SCREEN TESTS (HDMI1) ==="

echo "Play a video file"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playVideo","video":"defaults/intro_short.mp4","volume":80}'
wait_input "Zone 2: Play video file"

echo "Pause video"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"pauseVideo"}'
wait_input "Zone 2: Pause video"
echo "Resume video"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"resumeVideo"}'
wait_input "Zone 2: Resume video"
echo "Skip video"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"skipVideo"}'
wait_input "Zone 2: Skip video"

echo "Show a photo"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"setImage","image":"defaults/default.png"}'
wait_input "Zone 2: Show photo"

echo "ZONE 2 Audio Tests - Play looping background music"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input "Zone 2: Play looping background music"

echo "ZONE 2 Audio Tests - Play a speech file"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playSpeech","audio":"general/Welcome_ParadoxFX_Long.mp3","volume":80}'
wait_input "Zone 2: Play speech file"

# Zone 2 speech control tests
echo "Pause speech"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"pauseSpeech"}'
wait_input "Zone 2: Pause speech"
echo "Resume speech"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"resumeSpeech"}'
wait_input "Zone 2: Resume speech"

# Zone 2 speech skip test: queue two items and skip
echo "Queue two speech files (queuing test)"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playSpeech","audio":"general/PFX_Vocal_Queuing.mp3"}'
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playSpeech","audio":"general/PFX.mp3"}'
wait_input "Zone 2: Speech queuing test (two files)"
echo "Skip speech"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"skipSpeech"}'
wait_input "Zone 2: Skip speech"

echo "Trigger two video files (queuing test)"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playVideo","video":"defaults/default.mp4"}'
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playVideo","video":"defaults/intro_short.mp4"}'
wait_input "Zone 2: Video queuing test (two files)"

echo "ZONE 2 Audio Tests - Play an audio effect"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"playSoundEffect","audio":"fx/Deep_Braam_Long.mp3","volume":80}'
wait_input "Zone 2: Play audio effect"

echo "Stop the audio"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"stopBackground"}'
wait_input "Zone 2: Stop background audio"

echo "=== ZONE 3 DUAL AUDIO TESTS (Both HDMI) ==="

echo "Play looping background music"
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"playBackground","audio":"music/Classic_hip-hop_beat.mp3","loop":true,"volume":80}'
wait_input "Zone 3: Play looping background music"

echo "Play a speech file"
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"playSpeech","audio":"general/PFX_Vocal_Queuing.mp3","volume":80}'
wait_input "Zone 3: Play speech file"

echo "Play an audio effect"
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"playSoundEffect","audio":"fx/Huge_Braam.mp3","volume":80}'
wait_input "Zone 3: Play audio effect"

echo "Stop background audio"
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"stopBackground"}'
wait_input "Zone 3: Stop background audio"

echo "Play two speech files (queuing test)"
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"playSpeech","audio":"devices/HDMI_0.mp3"}'
mosquitto_pub -t "paradox/zone3/commands" -m '{"command":"playSpeech","audio":"devices/HDMI_1.mp3"}'
wait_input "Zone 3: Speech queuing test (two files)"

echo "=== CLEANUP ==="

echo "Stop video - Zone 2"
mosquitto_pub -t "paradox/zone2/commands" -m '{"command":"stopVideo"}'
wait_input "Zone 2: Stop video cleanup"

echo "=== TESTING COMPLETE ==="

# Test killPfx command to terminate ParadoxFX
echo "Kill ParadoxFX application"
mosquitto_pub -t "paradox/zone1/commands" -m '{"command":"killPfx"}'
wait_input "Kill ParadoxFX application"

# Show the summary at the end
show_summary
