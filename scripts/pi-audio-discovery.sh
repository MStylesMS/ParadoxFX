#!/bin/bash
# Small helpers
log() { echo "$@"; }
warn() { echo "WARN: $@" >&2; }
# Pi Audio Device Discovery Script
# Run this after booting on any Raspberry Pi (Pi5, Pi4, Pi3, Zero W) to verify audio device mappings

echo "=========================================="
echo "Pi Audio Device Discovery for ParadoxFX"
echo "=========================================="
echo ""

echo "=== System Information ==="
echo "Kernel: $(uname -r)"
MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null)
echo "Model: $MODEL"
echo "Memory: $(free -h | grep Mem | awk '{print $2}') total"
echo ""

# Detect Pi type
PI_TYPE="unknown"
if [[ "$MODEL" == *"Raspberry Pi 5"* ]]; then
  PI_TYPE="pi5"
elif [[ "$MODEL" == *"Raspberry Pi 4"* ]]; then
  PI_TYPE="pi4"
elif [[ "$MODEL" == *"Raspberry Pi 3"* ]]; then
  PI_TYPE="pi3"
elif [[ "$MODEL" == *"Zero"* ]]; then
  PI_TYPE="zero"
fi
echo "Detected Pi type: $PI_TYPE"
echo ""

echo "=== Audio Cards ==="
if [ -f /proc/asound/cards ]; then
    cat /proc/asound/cards
else
    echo "No audio cards found"
fi
echo ""

echo "=== ALSA Playback Devices ==="
aplay -l 2>/dev/null || echo "aplay command not available"
echo ""

echo "=== PulseAudio Sinks ==="
if command -v pactl &> /dev/null; then
    pactl list sinks short 2>/dev/null || echo "PulseAudio not running"
else
    echo "PulseAudio not available"
fi
echo ""

# If PulseAudio is present, show recommended mpv/pfx audio_device mappings
if command -v pactl &>/dev/null; then
  log "=== PulseAudio -> ParadoxFX concise pfx.ini suggestions ==="
  mapfile -t SINK_LINES < <(pactl list short sinks 2>/dev/null || true)
  if [ ${#SINK_LINES[@]} -eq 0 ]; then
    warn "No PulseAudio sinks detected"
  else
    hdmi0_name=""
    hdmi1_name=""
    analog_name=""
    # First pass: find explicit api.alsa.path matches
    for line in "${SINK_LINES[@]}"; do
      name=$(printf '%s' "$line" | awk '{print $2}')
      block=$(pactl list sinks | awk -v n="$name" 'BEGIN{RS="\n\n"} $0~n{print $0}')
      if echo "$block" | grep -q 'api.alsa.path = "hdmi:0"'; then
        hdmi0_name="$name"
      elif echo "$block" | grep -q 'api.alsa.path = "hdmi:1"'; then
        hdmi1_name="$name"
      elif echo "$block" | grep -q 'alsa.card = "2"' || echo "$block" | grep -qi 'Headphones'; then
        analog_name="$name"
      fi
    done
    # Fallback: assign hdmi names by ordering if still unset
    if [[ -z "$hdmi0_name" || -z "$hdmi1_name" ]]; then
      hdmi_count=0
      for line in "${SINK_LINES[@]}"; do
        name=$(printf '%s' "$line" | awk '{print $2}')
        if [[ "$name" == *hdmi* ]]; then
          if [[ -z "$hdmi0_name" ]]; then
            hdmi0_name="$name"
          elif [[ -z "$hdmi1_name" ]]; then
            hdmi1_name="$name"
          fi
          hdmi_count=$((hdmi_count+1))
        fi
      done
    fi

    # If analog still unset, try to find a non-hdmi sink
    if [[ -z "$analog_name" ]]; then
      for line in "${SINK_LINES[@]}"; do
        name=$(printf '%s' "$line" | awk '{print $2}')
        if [[ "$name" != *hdmi* ]]; then
          analog_name="$name"
          break
        fi
      done
    fi

    echo "Suggested pfx.ini entries (paste into appropriate zones):"
    if [[ -n "$hdmi0_name" ]]; then
      echo "  # HDMI0 (screen0)"
      echo "  audio_device = pulse:${hdmi0_name}"
    fi
    if [[ -n "$hdmi1_name" ]]; then
      echo "  # HDMI1 (screen1)"
      echo "  audio_device = pulse:${hdmi1_name}"
    fi
    if [[ -n "$analog_name" ]]; then
      echo "  # Headphones (analog)"
      echo "  audio_device = pulse:${analog_name}"
    fi
    echo ""
  fi
fi
echo "=== Current ParadoxFX Device Mapping ==="
case "$PI_TYPE" in
  pi5)
    echo "  screen0: alsa/plughw:1 (Expected: HDMI 0)"
    echo "  screen1: alsa/plughw:2 (Expected: HDMI 1)"
    echo "  headphones: alsa/plughw:0 (Expected: Analog)"
    ;;
  pi4)
    echo "  screen0: alsa/plughw:1 (Expected: HDMI 0)"
    echo "  screen1: alsa/plughw:2 (Expected: HDMI 1)"
    echo "  headphones: alsa/plughw:0 (Expected: Analog)"
    ;;
  pi3)
    echo "  screen0: alsa/plughw:0 (Expected: HDMI/Analog)"
    echo "  headphones: alsa/plughw:0 (Expected: Analog)"
    ;;
  zero)
    echo "  screen0: alsa/plughw:0 (Expected: Analog)"
    ;;
  *)
    echo "  Unknown Pi type. Please check device mapping manually."
    ;;
esac
echo ""

echo "=== Recommended Actions ==="
echo "1. Compare device indices above with ParadoxFX mapping."
echo "2. If different, update AUDIO_DEVICE_MAP in:"
echo "   - test/manual/test-audio-3devices.js (for multi-zone)"
echo "   - docs/MQTT_API.md (if documentation needs updating)"
echo "3. Test audio with: node test/manual/test-audio.js"
if [[ "$PI_TYPE" == "pi5" || "$PI_TYPE" == "pi4" ]]; then
  echo "4. Test multi-zone with: node test/manual/test-audio-3devices.js"
fi
echo "5. Commit any device mapping changes"
echo ""

SAMPLE_FILE="/opt/paradox/media/test/fx/Lasergun.mp3"

# Wait-and-retry settings (seconds)
AUD_DISCOVERY_TIMEOUT=${AUD_DISCOVERY_TIMEOUT:-15}
AUD_DISCOVERY_INTERVAL=${AUD_DISCOVERY_INTERVAL:-1}

# Wait for PulseAudio sinks to appear. Argument: minimum number of sinks expected.
wait_for_sinks() {
  local want_count=${1:-1}
  local elapsed=0
  if ! command -v pactl &>/dev/null; then
    return 1
  fi
  while [ "$elapsed" -lt "$AUD_DISCOVERY_TIMEOUT" ]; do
    count=$(pactl list short sinks 2>/dev/null | wc -l || echo 0)
    if [ "$count" -ge "$want_count" ] && [ "$count" -gt 0 ]; then
      return 0
    fi
    sleep "$AUD_DISCOVERY_INTERVAL"
    elapsed=$((elapsed + AUD_DISCOVERY_INTERVAL))
  done
  return 1
}

# honor SKIP_SPEAKER_TEST=1 to avoid playing sounds
if [ "${SKIP_SPEAKER_TEST}" = "1" ]; then
  echo "Skipping speaker tests because SKIP_SPEAKER_TEST=1"
else
  echo "Playing test file: $SAMPLE_FILE to each PulseAudio sink (3s each, 1s pause)"
  if command -v pactl &>/dev/null && command -v mpv &>/dev/null; then
    # For Pi4/Pi5 expect two HDMI sinks; otherwise one sink is fine.
    if [[ "$PI_TYPE" == "pi5" || "$PI_TYPE" == "pi4" ]]; then
      want=2
    else
      want=1
    fi
    if wait_for_sinks "$want"; then
      : # sinks appeared, continue
    else
      warn "PulseAudio sinks did not appear after ${AUD_DISCOVERY_TIMEOUT}s; proceeding with whatever is available"
    fi
    mapfile -t SINKS < <(pactl list short sinks 2>/dev/null | awk '{print $2}')
    if [ ${#SINKS[@]} -eq 0 ]; then
      warn "No PulseAudio sinks detected"
    else
      for sink in "${SINKS[@]}"; do
        echo "Testing sink: $sink"
        # Play a short portion to each sink and wait 1s between tests. Use timeout to avoid hangs.
        if timeout 6s mpv --no-video --really-quiet --audio-device="pulse/${sink}" --length=3 "$SAMPLE_FILE" &>/dev/null; then
          echo "  ✅ $sink: played"
        else
          echo "  ❌ $sink: failed"
        fi
        sleep 1
      done
    fi
  elif command -v mpv &>/dev/null; then
    echo "pactl not available; playing on default audio device with mpv"
    mpv --no-video --really-quiet "$SAMPLE_FILE"
  elif command -v paplay &>/dev/null; then
    paplay "$SAMPLE_FILE"
  elif command -v pw-play &>/dev/null; then
    pw-play "$SAMPLE_FILE"
  else
    # fallback to a very short ALSA tone if no player found
    echo "No audio player found (mpv/paplay/pw-play); attempting speaker-test fallback"
    case "$PI_TYPE" in
      pi5|pi4)
        for device in 0 1 2; do
          echo "Testing alsa/plughw:$device..."
          speaker-test -D plughw:$device -t wav -l 1 -c 2 -f 1000 &>/dev/null && echo "  ✅ Device $device: Working" || echo "  ❌ Device $device: Failed or not available"
        done
        ;;
      *)
        speaker-test -t wav -l 1 -c 2 -f 1000 &>/dev/null && echo "  ✅ Speaker test passed" || echo "  ❌ Speaker test failed"
        ;;
    esac
  fi
fi
echo ""

echo "=== GPU Memory Check ==="
if command -v vcgencmd &> /dev/null; then
    ARM_MEM=$(vcgencmd get_mem arm 2>/dev/null | cut -d'=' -f2)
    GPU_MEM=$(vcgencmd get_mem gpu 2>/dev/null | cut -d'=' -f2)
    echo "ARM Memory: $ARM_MEM"
    echo "GPU Memory: $GPU_MEM"
    case "$PI_TYPE" in
      pi5|pi4)
        if [[ "$GPU_MEM" == "256M" ]]; then
          echo "✅ GPU memory configured for $PI_TYPE (256MB)"
        elif [[ "$GPU_MEM" == "128M" ]]; then
          echo "⚠️  GPU memory at 128MB - increase to 256MB for best video performance"
        else
          echo "ℹ️  GPU memory: $GPU_MEM"
        fi
        ;;
      pi3|zero)
        if [[ "$GPU_MEM" == "64M" ]]; then
          echo "✅ GPU memory configured for $PI_TYPE (64MB)"
        else
          echo "ℹ️  GPU memory: $GPU_MEM"
        fi
        ;;
      *)
        echo "ℹ️  GPU memory: $GPU_MEM"
        ;;
    esac
else
    echo "vcgencmd not available"
fi

echo ""
echo "Discovery complete. Review results above and update device mappings if needed."
