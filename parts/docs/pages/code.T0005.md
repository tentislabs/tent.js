# T0005 rate-limited

A rate limit was reached. A caller gets it with the status 429.

## Details

A caller who is nobody may make `anyonePerMinute` calls in a minute from one address, 60 where the project states none, and a signed-in caller `callerPerMinute`, 600. One more is refused with this code before the function is looked for. An address of the newer kind is counted by its first 64 bits. Behind a proxy that the engine was told of, each visitor is counted by the address the proxy states in `X-Forwarded-For`, or in `Forwarded` where it is told so, and no visitor can write an address of their own: a proxy that states none sends every visitor under its own address, all of them one count. Beside these, an address may ask for `screensPerMinute` screens in a minute, 300; `/_t/health` and a file of the bundle are counted by nothing (`topic.engine.counts`).

The live connection has three bounds that answer with this code: one address holds `liveConnections` connections at once, 30 where the project states none, and one more opening is refused; one connection holds `watches` watches, 200, and an app `groups` groups of watches in all, 10,000, and one more watch is answered `failed` with this code (`topic.live.connection`). A watch itself counts on no limit of a minute.

## The fix

Send fewer requests, and try again when the minute has passed. Where a caller truly needs more, raise the limit in `limits` of the project.

## See also

`code.T0003`, `word.project`, `topic.live`
