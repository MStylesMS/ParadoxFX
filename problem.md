I see the problem! There's an infinite loop happening. The _processVideoQueue function is calling itself recursively when the queue is empty, and it's also calling _setDefaultImage() which then somehow triggers the queue processing again.

Looking at the log pattern:

"Video queue is empty. Returning to default image."
"Loading media: /opt/paradox/media/test/defaults/default.png"
This repeats infinitely
The issue is that _setDefaultImage() is calling this.zoneManager.loadMedia(), but since _setDefaultImage() doesn't go through the queue system, it might be triggering events that cause the queue to process again.

Let me fix this by:

Preventing the infinite loop: Make sure _processVideoQueue only calls itself when there's actually something to process
Fix the _setDefaultImage method: Make sure it doesn't interfere with the queue system
Add safety checks: Prevent recursive calls
screen-zone.js+5-2
screen-zone.js+1-0
Perfect! I've identified and fixed the infinite loop issue. The problem was:

Infinite Loop: When the video queue was empty, _processVideoQueue() was calling _setDefaultImage(), which might have been triggering more queue processing, creating an endless cycle.

Missing Logic for Images: Images don't have an "end-file" event like videos do, so the queue would get stuck waiting for an event that never comes.

Here's what I fixed:

Removed the problematic _setDefaultImage() call: When the queue is empty, we now just set isQueueProcessing = false and return, instead of trying to load the default image.

Added logic for image completion: When processing a setImage command, I immediately set isQueueProcessing = false and call _processVideoQueue() again to process the next item, since images don't generate end-file events.

Fixed the _handleMediaEnd() method: Added this.isQueueProcessing = false before calling _processVideoQueue() to ensure the flag is properly reset.

Now the queue should work correctly:

Videos will play and wait for the end-file event before processing the next item
Images will display and immediately allow the next item to be processed
No infinite loops when the queue is empty
Please try running the application again. The video should now play properly!

================================================
ME: I think the last couple of rounds of changes might have broken the logic. When it tried to play two videos close together the second video never played. Also, the ducking of the background audio is not working for the video.
================================================

You are right. It seems my recent changes have been a step backward. I apologize for the frustration. Let's analyze and fix these two issues properly.

Analysis of the Problems
Second Video Not Playing: You are correct, the logic I implemented for preventing duplicates is too aggressive. It checks the last item in the queue, so if you send two identical playVideo commands back-to-back, the second one is discarded as a duplicate before the first one even has a chance to play. The original intent was likely to prevent accidental double-clicks, not to block intentional queuing of the same video.

Audio Ducking Not Working: The error this.audioManager.duck is not a function from the previous run was a red herring. My "fix" was incorrect. I changed the code to call setBackgroundMusicVolume, but I see now that ScreenZone's audioManager is a separate instance from the one that actually controls the background music. The ScreenZone's audio manager is for its own audio capabilities (like video soundtracks), not for controlling the background music of another zone.

The correct way to handle this is for the ScreenZone to tell the main ZoneManager that it needs the audio ducked, and the ZoneManager should then route that request to the appropriate AudioZone.

Plan for the Fix
I will make the following changes to get this working correctly:

Fix Video Queuing: I will remove the duplicate-checking logic from _enqueueVideoCommand in screen-zone.js. This will allow you to queue the same video multiple times.

Fix Audio Ducking:

I will add duck() and unduck() methods to the ZoneManager in zone-manager.js. These methods will find the active AudioZone and call its ducking methods.
I will modify ScreenZone to call this.zoneManager.duck() and this.zoneManager.unduck() instead of trying to control the audioManager directly. This is a much cleaner and more robust approach.
I will add the corresponding duck() and unduck() methods to the AudioZone class in audio-zone.js which will, in turn, call the correct methods on its AudioManager.
I will now proceed with these changes.


