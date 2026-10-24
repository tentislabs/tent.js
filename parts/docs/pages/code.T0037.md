# T0037 room-ended

The room where the app's code runs ended the call: the code passed the memory the room gives it, or the program that ran it ended. Nothing the call would have written was written.

## Details

Where an app's code runs is the app's room. In the room of the program, the default, the engine sets no bound of memory. A room that runs code apart from the engine - the test room that `TENT_ROOM=apart` gives, the program of an app that states `hold`, or a room of the host that runs the engine - holds the code to a bound of its own. A call whose code passes it ends with this code, and the room is made anew at the next call, with every version loaded again. The engine and its other calls go on.

## The fix

Find what the call holds in memory at once: a list read whole where a page of it would do, a value built up in a loop that never ends. Read less at a time, or split the work into steps of a flow.

## See also

`code.T0008`, `option.project.hold`, `command.test`
