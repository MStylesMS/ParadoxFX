# ParadoxFX Feature Request: System & Process Control (Group 1)

## Overview
This feature request covers robust process and system-level control for ParadoxFX, including safe startup, shutdown, and remote management via MQTT.

## Requirements

### 1. Signal Handling & Process Cleanup
- Handle SIGINT and SIGTERM signals to ensure all child processes (e.g., MPV) are terminated and resources (sockets, temp files) are cleaned up.
- On startup, ensure no prior instances of PFX or MPV are running and that all relevant sockets are removed (similar to cleanup.js).
- On exit, perform a graceful shutdown of all zones and subsystems.
- Ensure cleanup occurs even if the process is killed (as much as possible).

### 2. MQTT System Commands
- Define and implement MQTT commands for:
  - Stopping PFX (exit process and cleanup)
  - Restarting PFX (shutdown and restart automatically)
  - Shutting down the host machine
  - Rebooting the host machine
- Document the expected topics, payloads, and responses for each command.

---

# ParadoxFX Feature Request: Screen & Display Control (Group 2)

## Overview
This feature request covers advanced screen management, including releasing/retaking screens and desktop background control.

## Requirements

### 1. Screen Release & Retake
- Implement MQTT commands to:
  - Release a screen so other applications/devices can use it (e.g., stop MPV, relinquish display resources)
  - Retake a screen so PFX can resume control (e.g., restart MPV, reinitialize display)

### 2. Desktop Background Management
- Optionally set the desktop background image when releasing a screen to make the transition less noticeable.
- Optionally restore the previous background when retaking control.
- Document feasibility, technical approach, and any OS-specific requirements (e.g., X11, Wayland, etc.).

---

## Notes
- Each group should be tracked as a separate feature request/issue.
- Include implementation notes, edge cases, and test scenarios in the final issue description.
