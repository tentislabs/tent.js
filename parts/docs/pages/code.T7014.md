# T7014 plain-fetch

Backend code calls `fetch` itself, or a backend file imports a network module of the runtime, such as `node:https`. A note of the check.

## Details

A plain `fetch` works: the engine puts a wrap in its place, which logs each call as a row of `outgoing` with the host as its call, holds it to a call that only reads, and to the address rule, so that an address a user typed cannot lead into the network of the host, straight or through a redirect, unless `privateHosts` lists it. It holds no limit of size or time, tries nothing again, and is no service that a test can fake with `app.fake`.

A connection that a network module of the runtime opens is seen by nothing of the engine, which is why such an import is noted too.

## The fix

Nothing to mend where a plain `fetch` is what the code needs. A server that the app calls often is better written as a `service`, whose calls have limits, tries, a once-only key inside a step, and a fake in tests.

## See also

`word.service`, `topic.fetch`, `code.T0022`
