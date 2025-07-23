#!/bin/bash

# ParadoxFX Cleanup Script
# Cleans up leftover MPV processes and socket files

echo "🧹 ParadoxFX Cleanup Script"
echo "=========================="

# Kill all MPV processes
echo "🔪 Killing MPV processes..."
MPV_PIDS=$(pgrep mpv)
if [ -n "$MPV_PIDS" ]; then
    echo "Found MPV processes: $MPV_PIDS"
    pkill -SIGTERM mpv
    sleep 2
    
    # Force kill if still running
    REMAINING_PIDS=$(pgrep mpv)
    if [ -n "$REMAINING_PIDS" ]; then
        echo "Force killing remaining MPV processes: $REMAINING_PIDS"
        pkill -SIGKILL mpv
    fi
    echo "✅ MPV processes terminated"
else
    echo "ℹ️  No MPV processes found"
fi

# Clean up socket files
echo "🧽 Cleaning up socket files..."
SOCKET_COUNT=0

# Remove zone-specific sockets
for socket in /tmp/mpv-screen:zone*-*.sock /tmp/mpv-audio:zone*-*.sock; do
    if [ -e "$socket" ]; then
        echo "Removing: $socket"
        rm -f "$socket"
        ((SOCKET_COUNT++))
    fi
done

# Remove any other MPV sockets that might be left over
for socket in /tmp/mpv-*.sock; do
    if [ -e "$socket" ]; then
        echo "Removing: $socket"
        rm -f "$socket"
        ((SOCKET_COUNT++))
    fi
done

if [ $SOCKET_COUNT -gt 0 ]; then
    echo "✅ Removed $SOCKET_COUNT socket files"
else
    echo "ℹ️  No socket files found"
fi

# Clean up any PulseAudio combined sinks
echo "🔊 Cleaning up PulseAudio combined sinks..."
COMBINED_SINK=$(pactl list sinks short | grep paradox_dual_output | cut -f1)
if [ -n "$COMBINED_SINK" ]; then
    echo "Removing combined sink: paradox_dual_output (ID: $COMBINED_SINK)"
    pactl unload-module module-combine-sink 2>/dev/null || true
    echo "✅ Combined sink removed"
else
    echo "ℹ️  No combined sink found"
fi

# Check for any remaining Node.js processes running pfx
echo "🔍 Checking for Node.js processes..."
PFX_PIDS=$(pgrep -f "node.*pfx.js")
if [ -n "$PFX_PIDS" ]; then
    echo "⚠️  Found PFX processes still running: $PFX_PIDS"
    echo "Use 'kill $PFX_PIDS' to terminate them if needed"
else
    echo "ℹ️  No PFX processes found"
fi

echo ""
echo "🎉 Cleanup complete!"
echo "You can now safely restart PFX with 'node pfx.js'"
