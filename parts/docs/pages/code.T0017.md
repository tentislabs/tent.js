# T0017 wrong-name

A request named a host that is none of the app's own names. A caller gets it with the status 421.

## Details

An app knows its own names. With no `address` it answers only as this computer: `localhost`, `127.0.0.1` and `[::1]`, on the port of the engine. With names of its own, `address` of `engine.open`, it answers on those, each with its port where that is not the usual one. A request that names any other host is refused before anything else is looked at. So a page of another site that points a name of its own at this computer cannot reach an app that is being developed.

`address: '*'` answers every name: it is for an engine behind a proxy that itself lets only the right names through.

## The fix

Reach the app by a name it was given. On a server, give the app its names when it is opened.

## See also

`code.T0004`, `topic.engine`
