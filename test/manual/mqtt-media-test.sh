#!/bin/bash

# Standalone MQTT media command test script for PxFx
# Edit the variables below to match your broker and topics


# MQTT broker settings
BROKER="localhost"
PORT=1883

# Screen/device selection (edit SCREEN_ID to match your PxFx config, e.g., ScreenA, ScreenB)
SCREEN_ID="ScreenA"
SCREEN_TOPIC="Paradox/Room/${SCREEN_ID}/Command"

# Test media files (adjust as needed)
IMG_FILE="houdini_picture_24bit.png"
AUDIO_FILE="default.mp3"
VIDEO_FILE="intro_short.mp4"
MEDIA_PATH="/opt/paradox/apps/pxfx/test/fixtures/test-media"

# Helper to publish a command
publish_cmd() {
  local topic="$1"
  local payload="$2"
  echo "Publishing to $topic: $payload"
  mosquitto_pub -h "$BROKER" -p "$PORT" -t "$topic" -m "$payload"
}

echo "--- MQTT Media Command Test ---"
echo "Broker: $BROKER:$PORT"
echo "Screen topic: $SCREEN_TOPIC"
echo "Media path: $MEDIA_PATH"
echo

# Test image command
publish_cmd "$SCREEN_TOPIC" '{"command":"display_image","file":"'$MEDIA_PATH/$IMG_FILE'"}'
sleep 2

# Test audio command
publish_cmd "$SCREEN_TOPIC" '{"command":"play_audio","file":"'$MEDIA_PATH/$AUDIO_FILE'"}'
sleep 2

# Test video command
publish_cmd "$SCREEN_TOPIC" '{"command":"play_video","file":"'$MEDIA_PATH/$VIDEO_FILE'"}'
sleep 2

# Test transition command (example: transition to another image)
TRANSITION_FILE="default.png"
publish_cmd "$SCREEN_TOPIC" '{"command":"transition","file":"'$MEDIA_PATH/$TRANSITION_FILE'","effect":"fade","duration":1000}'
sleep 2

echo "--- MQTT media test complete ---"
