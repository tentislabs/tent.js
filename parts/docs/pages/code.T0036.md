# T0036 not-sent

A call that a page held while it had no connection was not sent within `limits.callHold`. The call never reached the engine, and ran nothing.

## Details

A call that a page makes while its network is gone is held by the page, not failed: its view reads `busy` and `held` of the call, or `calls.<id>.busy` and `calls.<id>.held`, as true. When the connection is back - the browser says it is online, or a try after 1, 2, 4 and up to 30 seconds goes through - the held calls are sent in the order they were made. Each carries an id that the page made, so the engine runs it once, however often it is sent. A call held for `callHold` (two minutes where the project states no other) is failed with this code, and is never sent, so a press of long ago does not land unseen.

## The fix

Press again once the connection is back. Where the visitors of the app often lose their connection for longer, raise `callHold` in `limits` of the project.

## See also

`option.project.limits`, `hook.useCall`, `tag.Form`
