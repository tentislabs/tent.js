# T7111 not-agreed

A call was refused because no person agreed to it.

## Details

Inside a tool call of an agent that nobody agreed to, a function that asks a person and a call that sends data out are refused before they do anything.

| Where the call was made | What follows |
|---|---|
| In a step under a run of an agent | The step waits for the person. A yes has the step made again, and the call at that place passes. A no, and the end of the time, fail the step with this code |
| In a flow that a tool call started or set off | There is nobody to ask: the step fails with this code at once |

A step that failed with this code is not tried again. Code that catches the error has gone on without the call, and nobody is asked.

## The fix

State what a flow does where it is used as a tool, so that the person is asked at the tool: `danger: 'ask'`, or leave `sends: false` out where it sends. A flow that must send with nobody asked is started by code that no tool call set off.

## See also

`topic.flows`, `word.agent`
