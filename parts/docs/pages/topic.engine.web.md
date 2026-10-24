# The web side

The web side of an engine starts with its first app, on the port and the host of `createEngine`: 3000 and `127.0.0.1` where none is given, and a free port for 0.

| Address | For |
|---|---|
| `POST /_t/call/<name>` | A call of a function. The body is JSON, stated as `Content-Type: application/json`: `{ "input": { ... } }` |
| `/_t/health` | Answers when the app is ready: `{ "ok": true, "value": { "app", "version" } }` |
| `POST /_t/read/<name>` | A read from a page, with the body and the answer of a call. It takes a query or an action and nothing else, and an action is called read-only there |
| `GET /_t/b/<file>` | A file of the bundle that a browser loads: only one under `browser/` or `assets/` that the description names. It is the same for every caller and is kept for a year |
| `/_t/live` | The live connection, a WebSocket over which a page watches its queries. `app.live(request)` opens it in a program, with no network (`topic.live.machines`) |
| `GET /_t/screen?path=<address>&version=<id>` | What a request for that address of the app would have answered, as data: the record of the page with its answers and no drawing, `{ goTo }`, or `{ leave }`. A page asks it when a watch of its screen fails and when its caller changed (`topic.live.connection`) |
| `GET` of any other address | A screen: the first HTML of the screen that the address fits |

## A page

A request for a screen is answered with a whole document: the drawing of the screen with its data, and the record of the page, from which the page comes alive in the browser. `app.page(path, { as })` answers the same in a program, as `{ status, headers, html }`.

| Outcome | Answer |
|---|---|
| The screen is found, the caller is let in, and every entry of its `data` answered | 200, the screen |
| The screen needs a signed-in caller and there is none, also where an entry of its `data` does | 302 to `<signInPath>?back=<the address asked for>`, where a screen stands at `signInPath`; where none does, a browser is shown the engine's page of a sign-in that is needed, with 401, and a program is still sent the 302 |
| No screen fits the address; a signed-in caller whom the rule does not let in; an entry that is `needed` and answers nothing; an input of an entry that does not fit its type | 404, with one line of words |
| An entry of its `data` fails otherwise, or its view fails | The status of the error, 500 for a failure of code, with the words of the error as its caller sees it |
| The address ends in a slash | 308 to the same one without it |

A request for a screen is one row of `calls` in the log, of the kind `screen`: under the name of the screen, or under the path that was asked where no screen answers it, with `ok` and the code of how it ended, as a call is written. An address with a slash at its end is answered with a move to the same address without it, and is written under the name of the screen it leads to: an address may carry a code, and no value of one stands in the log. A screen whose drawing took longer than 50 ms, all its passes together, is one row of `slow` under its name. A screen that is not found is `code.T0001`, a way to the sign-in `code.T0006`, a caller who is not let in `code.T3101`, and a failure its own code, with a `ref` that finds it in `errors`.

Of two screens that fit an address the more exact one wins: `/orders/new` before `/orders/:id`, and that before `/orders/*`. An address that holds `//` or `\` is no address of the app.

An action that a screen reads as an entry of its `data` is called read-only, in the draw and every time the page asks it again: inside it a query, another action and a `fetch` that is a `GET` work, and a change and any other `fetch` are refused with `code.T0013`. An action that must write is called by a press.

On an app that runs on several machines, a reader answers a screen by itself, from the rows it holds: so does it answer a read of a query from a page and a file of the bundle. A screen whose `data` holds an action is handed to the writer before any of it has run, since the writer carries out every action, and so is a screen that meets an action while it is drawn. A caller that a session signed in is the same caller on the writer: the reader holds the sessions by its copy of them. A request for a screen that names a mark, by the cookie of the caller's last write or by `Tent-After`, is held to the highest number of the mark: the reader waits a moment for that write, and hands the request to the writer where it does not arrive.

Every page is sent with a content policy that the engine writes from the description: scripts and style files come from the files of the bundle alone, no script that is written into a page is run, and the page is shown in a frame by nobody unless its screen states `framedBy`. `hosts` of `project` names where pictures may come from, and `unlock` opens what its entries name: `scripts`, `styles`, `fonts`, `frames`, `styleTags`, `wasm`, `blobWorkers`, `eval`, `camera`, `microphone`, `location`, and `more`.

An answer is `{ "ok": true, "value": ... }` or `{ "ok": false, "error": { "code", "name", "message" } }`, with the status of its code. A moment travels as text in the standard form. On live data an error holds the general sentence of its code and no `fix`; an error that is not the caller's to see is `code.T0009` with a `ref` that finds it in the log.

Every request passes the door: a request for a name that is none of the app's own is `code.T0017`; a body over `callSize` is `code.T0003`; a request that changes something from a page of another site is `code.T0004`; and a caller is held to the calls of a minute, `code.T0005`. The body of a call is read strictly: a value that nests more than 64 deep, a key `__proto__`, two keys of one name, a number too large to hold and half of a character are each `code.T0002`.

`engine.open(bundle, { address })` gives the app its names: one name, a list, or `'*'` for every name. With none it answers only as this computer: `localhost`, `127.0.0.1` and `[::1]` on the port of the engine. A name is the host as a request names it, with its port where the engine is reached on one that is not 80 or 443: an engine on port 3000 names `'builder.localhost:3000'`, and a request for `builder.localhost:3000` to an app named `'builder.localhost'` is `code.T0017`. `app.request(request, { from })` sends any request through every step of the door with no network. `app.caller(request)` answers who a request is to the app, as the door finds it by its session, its key or its token, and carries nothing out: `{ kind: 'user', user: { id, roles } }` for the cookie of a session, `{ kind: 'nobody' }` where nothing names anyone. So the `onRequest` of a program learns whose request it holds.

`createEngine({ proxy: { from: ['10.0.0.0/8'] } })` names the proxies in front of the engine. From a named proxy the address of a request is the last one of `X-Forwarded-For` that is no named proxy, and the scheme is `https`. `header: 'forwarded'` reads the standard `Forwarded` header instead, `scheme` is `'https'`, `'http'` or `'header'`, and `host: true` reads the forwarded host. From any other address no such header is read. A command of this computer comes from `127.0.0.1`, so behind a proxy named by that address the engine takes no command (`code.T0006`): a host in front on this computer reaches the engine from another of its addresses, `127.0.0.2`, named in `--proxy from` (on macOS add it first, with `sudo ifconfig lo0 alias 127.0.0.2`). `web` bounds the connections: `headSize`, `headTime`, `closeAfter`, `bodyCloseAfter`, `bodySpeed`, `open`, `openPerAddress` and `stopTime`. `bodyCloseAfter` bounds a reader too: one that takes nothing of an answer waiting for it for that long is closed, while the time an answer takes to begin is never the sender's.

## A session made in the program

`app.session(user)`, in the modes `development` and `test`, makes a session for a user as `sessions.start` does (`handle.sessions`), with no request and no address of the app, and answers the line of its cookie, `tent_session.<the app's name>=<the token>`. The user is the id of a row of `users`, or a caller that is a user: anything else is `code.T2103`. A request that carries the cookie is that user, with the roles the row holds at that moment, as with every session; a call of a page names the user it was drawn for in `"as"`. It is how a program that holds the app, a test above all, makes a real browser a user: the helpers of a test stand on it (`topic.tests`). No address of the app makes anyone a user: a person signs in through the app's own sign-in screen (`topic.signIn`). In the mode `live` it fails with `code.T0013`, and on a reader with `code.T0030`: the writer makes the session, and the readers hold it.

`app.shot(path, { as, size, full, dark, wait, out })` takes a picture of a screen with a browser of the Chromium family on the computer, and answers `{ file, width, height, status }`. `as` is a user, named as for `app.session`, whose session the browser holds before it opens the screen; on live data a picture is taken as nobody only. `size` is 1280 by 800 where it is left out, `full` takes the whole height of the page and `dark` the browser's dark mode. Without `out` the picture is written to `shots/` in the data folder. `command.shot` takes the same picture of an engine that runs.

`app.export(folder, { base, origin, version, names })` writes the public part of the app out as plain files, from a release build, as nobody, and answers `{ pages, skipped, findings }`: `command.export` says what is written and what is left out.

## The inspect mode

`app.inspect({ framedBy, for })` answers a token of 32 characters that puts a page into the inspect mode for a visual tool: a page asked for with `?t-inspect=<token>` may be shown in a frame of the pages of the origin `framedBy`, and tells that tool which element is pointed at (`topic.inspect`). `framedBy` is one origin - a scheme, a host and a port, as `'https://studio.example.com'` - or `{ opener: <origin> }`, for a tool of that origin that opens the page in a window of its own. `for` is how long the token holds, as `'30 minutes'`, and one hour where it is left out. Anything else is `code.T0002`. A token lives in the memory of the engine: it opens nothing on another app, and is gone when the app is closed or falls asleep. The program that holds the app gives it, in every mode; the command of the admin channel `inspect` with `{ framedBy, for }` answers `{ address }`, the address of the app on this computer with a new token, and `command.dev` prints one with `--inspect`.
