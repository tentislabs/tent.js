# The connection

A page opens one WebSocket to `/_t/live` when it shows a live query. The opening passes steps 1 to 4 of the door, and must carry an `Origin` that names the app's own address or a site that `api.origins` of the project lists: any other site, and no `Origin` at all, is refused with `code.T0004`. A plain request for the address is not found.

Every message is one JSON object in a text frame, with its name in `t`.

| From | Message | Meaning |
|---|---|---|
| Page | `{ t: 'watch', id, query, input, version, have, seen }` | Watch a query. `id` is the page's own name for the watch, and a second watch under an id that is still watched takes its place. `have` is the mark of the answer the page holds. `seen` is the write that the answer must hold, on an app of several machines |
| Page | `{ t: 'unwatch', id }` | Stop |
| Page | `{ t: 'alive' }` | The answer to each `alive` of the engine |
| Page | `{ t: 'thrown', message, stack, screen }` | In the mode `development`: a view failed as it drew in the browser. The engine leads its trace back to the project's source by the source maps of the bundle, and every open page shows it in its overlay |
| Engine | `{ t: 'result', id, value, mark, at }` | The first answer, and every changed one that is sent whole. `mark` is the first 16 characters of the fingerprint of `value` as it is sent. `at` is the write the answer was worked out at, on an app that has a reader or is one, and is left out by any other |
| Engine | `{ t: 'rows', id, was, mark, at, put: [{ row, after }], removed: [ids], next }` | What changed in a list of rows since the answer whose mark is `was`. `after` is the id of the row before it in the new list, and is left out for the first row |
| Engine | `{ t: 'failed', id, error }` | The query failed, or this caller may not call it. The watch is over |
| Engine | `{ t: 'alive' }` | A sign of life, every 30 seconds. A connection that does not answer within 15 seconds is closed |
| Engine | `{ t: 'changed' }` | The caller is no longer the one the page was drawn for. The connection is closed after it |
| Engine | `{ t: 'reload' }` | The version of the page was dropped by a hard switch, or in the mode `development` a file of a package changed. The page loads its address anew |
| Engine | `{ t: 'version', version, swap? }` | In the mode `development`: another version runs now. Where the save changed the look alone, `swap` names each module the page takes in place by Fast Refresh, as `{ address, mark }`: the page takes them and keeps its watches, which the engine moved to the version. With no `swap` the page asks for its screen again under it, and sends its watches again |
| Engine | `{ t: 'findings', findings }` | In the mode `development`: what the page shows as an overlay: what was found of the project, and each failure while running (`command.dev`). An empty list takes the overlay away |

A page puts a `rows` message into the list it holds in three steps: it takes out the rows that `removed` names and every row that `put` names, then puts each entry of `put` after the row that its `after` names, in the order of the message. When `was` is not the mark of what it holds, it sends the watch again and is answered whole.

A watch of a name that is no query, of a query that states `live: false`, of a change or of an action is answered `failed` with `code.T0001`, and nothing is run. A watch that names a version which can no longer be loaded is answered `failed` with `code.T0007`.

## The limits

Each is changed in `limits` of the project (`option.project.limits`).

| Limit | Holds | Where none is stated | One more |
|---|---|---|---|
| `liveConnections` | The connections that one address holds at once | 30 | The opening is refused with `code.T0005` |
| `watches` | The watches of one connection | 200 | `failed` with `code.T0005` |
| `groups` | The groups of watches that an app holds in all | 10,000 | `failed` with `code.T0005` |
| `liveMessages` | The messages that a connection sends in a second | 100 | The connection is closed |
| `liveWaitingSize` | The bytes that wait for a page which does not take what it is sent | 1 MB | The connection is closed |
| `callSize` | The bytes of one frame that a page sends | 1 MB | The connection is closed |
| `liveRows` | The rows that one read of a live query answers | 10,000 | The query fails with `code.T2108` |

A connection is also closed for a frame that is not one JSON object with a known `t`, and for a frame of bytes.

## What a page does by itself

Nothing of this is written in a screen: the page code does it for every entry of `data` and every `useQuery` that reads a live query.

| When | The page |
|---|---|
| It comes alive | Opens the connection once it shows a live query, and watches each with the mark of the answer that the first HTML held. So the engine sends it nothing until a row changes. A page that shows no live query opens no connection |
| A view shows a query no more | Gives its watch up |
| The connection is lost | Tries again after between half a second and one and a half, and doubles the wait after each try that fails, up to thirty seconds. Once connected it sends every watch again with the mark it holds, and is sent only what changed meanwhile |
| No connection can be opened | Asks its live queries again through the door, at `/_t/read/`, after each of its own calls that worked and every 30 seconds. So it still shows its own change |
| A watch of an entry of the screen's `data` fails | Asks for its screen again, and shows what the engine gives: the sign-in screen for a caller who is signed in no more, the `notFound` screen for a right that was lost |
| A watch of a `useQuery` fails | Hands the error to the view, as `error` of the hook |
| A watch of an entry of a component's `data` fails | Makes that name nothing, with the error in `calls.<name>.error` |
| The engine says `changed` | Closes the connection, forgets every answer, and asks for its screen again as the caller that it is now |

A query that states `live: false`, and an action, is never watched. It is read at `/_t/read/`, and again after each call of the page that worked.

The page asks for its screen again at `GET /_t/screen?path=<its address>&version=<its version>`, which answers what a request for that address would have answered, as data and with no drawing: the record of the page with every answer, `{ goTo }` where the visitor would have been sent on to another address of the app, or `{ leave }` for an address that is no screen, and for a screen that needs a sign-in where no screen stands at `signInPath`: the page then loads the address whole, and the browser is shown the engine's page for a sign-in that is needed. With `&prefetch=1` no action of `data` is called.
