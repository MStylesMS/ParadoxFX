#!/bin/bash

# ParadoxFX Cleanup Script
# ========================
# Cleans up MPV processes, socket files, and PulseAudio sinks
# Use this before restarting PFX or for troubleshooting

echo "🧹 ParadoxFX Cleanup Script"
echo "=========================="

# Kill MPV processes
echo "🔪 Killing MPV processes..."
mpv_pids=$(pgrep mpv)
if [ -n "$mpv_pids" ]; then
    echo "   Found MPV processes: $mpv_pids"
    pkill mpv
    sleep 2
    
    # Force kill if still running
    remaining_pids=$(pgrep mpv)
    if [ -n "$remaining_pids" ]; then
        echo "   Force killing remaining MPV processes: $remaining_pids"
        pkill -9 mpv
    fi
    echo "✅ MPV processes terminated"
else
    echo "ℹ️  No MPV processes found"
fi

# Clean up socket files
echo "🧽 Cleaning up socket files..."
socket_count=0
for socket in /tmp/mpv-*.sock /tmp/pfx-*.sock; do
    if [ -e "$socket" ]; then
        rm -f "$socket"
        socket_count=$((socket_count + 1))
    fi
done

if [ $socket_count -gt 0 ]; then
    echo "✅ Removed $socket_count socket files"
else
    echo "ℹ️  No socket files found"
fi

# Clean up PulseAudio combined sinks
echo "🔊 Cleaning up PulseAudio combined sinks..."
if command -v pactl >/dev/null 2>&1; then
    # Check if paradox_dual_output sink exists
    if pactl list short sinks | grep -q "paradox_dual_output"; then
        echo "   Found combined sink 'paradox_dual_output', unloading..."
        pactl unload-module module-combine-sink
        echo "✅ Combined sink unloaded"
    else
        echo "ℹ️  No combined sink found"
    fi
else
    echo "ℹ️  pactl command not found, skipping PulseAudio cleanup"
fi

# Kill ParadoxFX Node.js processes
echo "🔪 Killing ParadoxFX (node) processes..."
pfx_pids=$(pgrep -f "node start.js")
if [ -n "$pfx_pids" ]; then
    echo "   Found PFX processes: $pfx_pids"
    pkill -f "node start.js"
    sleep 1
    echo "✅ PFX processes terminated"
else
    echo "ℹ️  No PFX processes found"
fi

echo ""
echo "🎉 Cleanup complete!"
echo "You can now safely restart PFX with 'node pfx.js'"


# Check for Node.js processes
echo "🔍 Checking for Node.js processes..."
pfx_pids=$(pgrep -f "node.*pfx")
if [ -n "$pfx_pids" ]; then
    echo "   Found PFX processes: $pfx_pids"
    pkill -f "node.*pfx"
    sleep 2
    
    # Force kill if still running
    remaining_pids=$(pgrep -f "node.*pfx")
    if [ -n "$remaining_pids" ]; then
        echo "   Force killing remaining PFX processes: $remaining_pids"
        pkill -9 -f "node.*pfx"
    fi
    echo "✅ PFX processes terminated"
else
    echo "ℹ️  No PFX processes found"
fi

echo ""
echo "🎉 Cleanup complete!"
echo "You can now safely restart PFX with 'node pfx.js'"
