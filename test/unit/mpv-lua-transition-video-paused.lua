-- MPV Lua script: Play video, pause on first and last frame, with console output

-- Use the MPV Lua API to control video playback
-- and handle events for a seamless transition effect.

-- DISPLAY=:1 mpv --fullscreen --keep-open=always --force-window=immediate --msg-level=all=info --script=/opt/paradox/apps/pxfx/test/unit/mpv-lua-transition-video-paused.lua /opt/paradox/apps/pxfx/test/fixtures/test-media/transition_video.mp4


local media_dir = "/opt/paradox/apps/pxfx/test/fixtures/test-media/"
local video_file = media_dir .. "transition_video.mp4"

local paused_on_first = false
local paused_on_last = false

mp.msg.info("[PxFx] Lua script loaded! Preparing to load video: " .. video_file)

function on_start_file()
    mp.msg.info("[PxFx] Loading video and pausing on first frame for 2 seconds...")
    mp.set_property("pause", "yes")
    paused_on_first = true
    mp.add_timeout(2, function()
        mp.msg.info("[PxFx] ...transition now....")
        mp.set_property("pause", "no")
    end)
end

function on_eof_reached(name, value)
    if value and not paused_on_last then
        paused_on_last = true
        mp.msg.info("[PxFx] ...paused on last frame (window will stay)...")
        -- Do NOT set pause=yes or reload file, just wait and quit
        mp.add_timeout(8, function()
            mp.msg.info("[PxFx] ...done.")
            mp.commandv("quit")
        end)
    end
end

mp.register_event("file-loaded", on_start_file)
mp.observe_property("eof-reached", "bool", on_eof_reached)
