#!/bin/bash
# Install ParadoxFX and xhost startup entries into the user's autostart directory

# Determine autostart directory
AUTOSTART_DIR="$HOME/.config/autostart"

# Ensure directory exists
mkdir -p "$AUTOSTART_DIR"

echo "Installing autostart desktop entries to $AUTOSTART_DIR"

# Copy desktop files
cp "$(dirname "$0")/../config/pfx.desktop" "$AUTOSTART_DIR/"
cp "$(dirname "$0")/../config/startup-xhost.desktop" "$AUTOSTART_DIR/"

# Make sure entries are enabled
sed -i 's/X-GNOME-Autostart-enabled=false/X-GNOME-Autostart-enabled=true/' "$AUTOSTART_DIR/pfx.desktop"
sed -i 's/X-GNOME-Autostart-enabled=false/X-GNOME-Autostart-enabled=true/' "$AUTOSTART_DIR/startup-xhost.desktop"

# Inform user
echo "✅ Autostart entries installed."
echo "You can verify by listing $AUTOSTART_DIR:" 
ls "$AUTOSTART_DIR"
