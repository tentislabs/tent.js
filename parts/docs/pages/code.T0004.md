# T0004 wrong-origin

A request that changes something came from a page of another site. A caller gets it with the status 403.

## Details

A request changes something when it is neither a `GET` nor a `HEAD`. One that does, and carries an `Origin`, must name the scheme, the host and the port it was sent to, or an entry of `api.origins` of the project. `Origin: null` names no host and is refused. A request with no `Origin`, as a program sends it, passes. The function is not run.

The opening of the live connection, `/_t/live`, is held to more: it must carry an `Origin`, and that must name the address it was sent to or an entry of `api.origins`. One from another site, and one with no `Origin` at all, is refused with this code before a connection is made, whatever cookie it carries (`topic.live.connection`).

Behind a proxy the scheme and the name are what the proxy rule gives: `https` and the request's own host, unless `proxy` of `createEngine` says otherwise.

## The fix

Call the app from its own pages. A site that may call it is listed in `api.origins` of the project. Behind a proxy that the engine was not told of, the engine takes every request as plain `http`: name the proxy with `tent start --proxy from=<address>`.

## See also

`code.T0017`, `word.project`, `topic.live`
