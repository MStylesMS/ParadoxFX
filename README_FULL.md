# ParadoxFX - Complete Documentation

## Table of Contents
- [Installation](#installation)
- [Configuration](#configuration)
- [Running PFX](#running-pfx)
- [Process Management with systemd](#process-management-with-systemd)
- [MQTT Commands](#mqtt-commands)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites
- Node.js >= 15.1.0
- MQTT broker (Mosquitto recommended)
- MPV media player
- Linux system (Raspberry Pi recommended)

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure your settings in `pfx.ini`
4. Test the installation: `npm test`

## Configuration

PFX uses INI configuration files. The main configuration is in `pfx.ini`:

```ini
[mqtt]
broker_url = mqtt://localhost:1883
client_id = pfx-houdini

[zones]
screen = true
audio = true

[media]
base_path = ./media
```

See the example configuration files in the `config/` directory for more options.

## Running PFX

### Manual Execution
```bash
# Production mode
npm start

# Debug mode with verbose logging
npm run dev
```

### Background Execution
```bash
# Run in background with nohup
nohup npm start > pfx.log 2>&1 &

# Or use screen/tmux for interactive background sessions
screen -S pfx npm start
```

## Process Management with systemd

For production deployments, it's recommended to run PFX as a systemd service. This provides:
- Automatic startup at boot
- Automatic restart on crashes
- Proper logging through journald
- Easy management with `systemctl` commands

### Creating the Service

1. **Create the service file** at `/etc/systemd/system/pfx.service`:

```ini
[Unit]
Description=ParadoxFX Multi-screen Effects System
After=network.target graphical.target
Wants=network.target

[Service]
Type=simple
User=paradox
Group=paradox
ExecStart=/usr/bin/node /opt/paradox/apps/pfx/pfx.js
WorkingDirectory=/opt/paradox/apps/pfx
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=HOME=/home/paradox

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pfx

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/paradox/apps/pfx/logs
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
```

2. **Install and enable the service**:

```bash
# Copy the service file
sudo cp pfx.service /etc/systemd/system/

# Set proper permissions
sudo chown root:root /etc/systemd/system/pfx.service
sudo chmod 644 /etc/systemd/system/pfx.service

# Reload systemd configuration
sudo systemctl daemon-reload

# Enable auto-start at boot
sudo systemctl enable pfx

# Start the service
sudo systemctl start pfx
```

### Service Management Commands

```bash
# Start the service
sudo systemctl start pfx

# Stop the service
sudo systemctl stop pfx

# Restart the service
sudo systemctl restart pfx

# Check service status
sudo systemctl status pfx

# View logs
sudo journalctl -u pfx -f

# View recent logs
sudo journalctl -u pfx --since "1 hour ago"

# Enable auto-start at boot
sudo systemctl enable pfx

# Disable auto-start at boot
sudo systemctl disable pfx
```

### How restartPfx Command Works with systemd

When PFX is running as a systemd service, the `restartPfx` MQTT command will:

1. Execute cleanup procedures (stop media, close connections)
2. Exit the process with `process.exit(0)`
3. systemd detects the process exit
4. systemd automatically starts a new PFX instance (due to `Restart=always`)
5. New instance reconnects to MQTT and resumes operation

This provides a clean restart mechanism that survives system reboots and handles failures gracefully.

### Troubleshooting systemd Service

```bash
# Check if service is running
sudo systemctl is-active pfx

# Check if service is enabled for boot
sudo systemctl is-enabled pfx

# View detailed service information
sudo systemctl show pfx

# Check for service failures
sudo systemctl --failed

# Reset failed state
sudo systemctl reset-failed pfx
```

## MQTT Commands

PFX responds to commands sent via MQTT. See the main README.md for the complete command reference.

### Supported Commands

All zones support these base commands:
- `getSupportedCommands` - List available commands
- `getState` - Get current zone state
- `sleepScreen` - Put screen to sleep
- `wakeScreen` - Wake screen from sleep

Screen zones additionally support:
- `playVideo` - Play video content
- `playAudio` - Play audio content
- `showImage` - Display image
- `setZoneVolume` - Set audio volume (0-100)
- `setBrowserUrl` - Set browser URL
- `setBrowserKeepAlive` - Enable browser monitoring
- `restartPfx` - Restart the entire PFX process
- `killPfx` - Terminate PFX process

### Command Examples

```bash
# Set zone volume to 75%
mosquitto_pub -t "paradox/houdini/mirror/commands" -m '{"command":"setZoneVolume","volume":75}'

# Restart PFX (requires systemd service for automatic restart)
mosquitto_pub -t "paradox/houdini/mirror/commands" -m '{"command":"restartPfx"}'

# Set browser URL
mosquitto_pub -t "paradox/houdini/mirror/commands" -m '{"command":"setBrowserUrl","url":"http://localhost/clock"}'
```

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
```

### Debug Mode
```bash
# Run with debug logging
npm run dev

# Or set log level directly
LOG_LEVEL=debug node pfx.js
```

### Testing New Commands
Use the test script to validate new MQTT commands:
```bash
node test-new-commands.js
```

## Troubleshooting

### Common Issues

**PFX won't start**
- Check Node.js version: `node --version` (requires >= 15.1.0)
- Verify MQTT broker is running: `mosquitto_sub -t test`
- Check configuration file syntax
- Review logs for error details

**MQTT connection issues**
- Verify broker URL in configuration
- Check network connectivity
- Ensure MQTT broker allows connections
- Review firewall settings

**Media playback problems**
- Verify MPV is installed: `mpv --version`
- Check media file permissions
- Ensure proper codec support
- Review audio/video device settings

**systemd service issues**
- Check service status: `sudo systemctl status pfx`
- Review logs: `sudo journalctl -u pfx`
- Verify file permissions and paths
- Check user/group settings in service file

### Log Files

When running manually, PFX creates log files in the `logs/` directory:
- `pfx-latest.log` - Current session
- `pfx-YYYY-MM-DD_HH-MM-SS.log` - Timestamped logs

When running as systemd service, logs are available via:
```bash
sudo journalctl -u pfx
```

### Performance Monitoring

Monitor PFX resource usage:
```bash
# CPU and memory usage
top -p $(pgrep -f pfx.js)

# systemd service resource usage
sudo systemctl status pfx
```
