# An app from a program

This page says how a program of your own uses an app: a call with no web around it, its log and its data, what a part above the engine gives it, what the check needs of the data, and query threads.

## A call with no web around it

`app.call(name, input, { as })` passes the same steps as a call from a page, but for those that belong to the web: it finds the function by its name, checks its rule and its input, carries it out with a `db` that is limited to its caller, filters what it answers through its output, and writes the call into the log. `as` is a caller: `{ kind: 'system' }`, `{ kind: 'nobody' }`, or `{ kind: 'user', user: { id, roles } }`. A call that fails refuses its promise with the `TentError`. An error of the app's own code arrives as `code.T0009`, with the error as its `cause`.

## The log of an app, for a program

`app.logs({ errors, since, newest })` answers the rows of the log of the app: its newest calls, errors and slow queries, each in the order they were written. `errors: true` answers the errors alone, `since` only what was written within that length of time, as `'1 hour'`, and `newest` at most that many of each. A `since` that does not read as a length of time is `code.T0002`.

## What a part above the engine gives it

`engine.give(kind, name, object, app?)` hands the engine a thing with a fixed place that a part above it brings, for one app or for every app of the engine where none is named: a command of the admin channel, as `{ run(app, args) }`; a share of the daily upkeep, as `{ daily() }`; the working object behind a handle, as `createWorkspaces` gives `handle.workspaces`, each of whose members the engine hands `{ caller }` of the call it is used in first, and holds to full access; and an `onRequest`, which stands in front of the engine's own: a request is handed it first; and an `onLink`, which is handed the opening of a connection first and answers its other end, or nothing where the engine's own live connection and links are to take it. A thing that has not the form of its kind is `code.T0013`, and so is a handle that nobody gave, where it is used.

`engine.offer(name, source)` keeps a source of tools, `{ tools(o), call(o) }`, which a run is given by `app.start` with `sources: [{ name, context }]`. A tool of a source is the code of the part that offered it, and is carried out as the program's own, outside the call of the run: what it fetches is not held as the app's, and an app it calls is called as by any program. The `ask` it is handed makes the step of the run wait for the person's yes. An answer that holds `images`, each `{ kind, data }` with its bytes in base64, gives a model that takes pictures each one as an image, kept as a file of the run, beside the rest of the answer.

A program that holds apps for others opens each with what it knows of them: `identify`, which names who calls the app in place of the project's own, `framedBy`, the sites that may show every screen of it in a frame beside those a screen names, and `lazy`, which a program that holds many apps states.

## The data of an app, for a program

```ts
import { table, text } from 'tentjs'
const tasks = table('tasks', { columns: { title: text() } })

const open = await app.read(tasks.where({ title: { startsWith: 'a' } }), { as: caller })
const [row] = await app.write([tasks.add({ title: 'a new one' })], { as: 'system' })
await app.seed()
const { writes } = await app.snapshot('backups/now.db')
await app.restore('backups/now.db')
```

`app.read` carries a plan out and `app.write` a list of writes, as a table gives them, under the rules of the caller that `as` names: a caller, `'system'` or `'nobody'`. A list of writes is one write. As the system no rule holds, and only then does a read answer a `private` column. Each is carried out as a call, a read as a query and a write as a change: a rule of a table finds its setting and `now()` there as it does at the door, and what a query may not do is refused in a read (`code.T4101`). `app.seed()` applies the starter data of the running version, as the system: an engine never applies it by itself. `app.snapshot` writes the data file out while the app runs and answers the number of the last write that the snapshot holds, and `app.restore` puts such a file back under the running app and applies the table changes to it.

## What the check needs of the data

```ts
import { readFacts } from 'tentjs/engine'

const facts = app.facts(description)
const same = readFacts('data/shop', description)
```

`app.facts(description)` answers what the table change from the data of the running app to a description would be refused for, `code.T2001` to `code.T2004`, as `{ tableFindings, waitingStepNames }`, and for the running version where it is handed none. It changes nothing. `readFacts(dataFolder, description, { makers })` answers the same with no engine running: it opens the data to read alone for the length of the call, with the `store` of `makers` where there is one, and a folder that holds no data says nothing. Both are what `checkProject` of `tentjs/check` takes as `facts`.

## Query threads

A query that states `heavy: true` is carried out on a query thread where it is asked through the door or from an action, so a slow read does not hold up the app. A thread has a store of its own, opened to read alone, and loads the modules of the bundle only for a query that needs one: a query in our own words is carried out from the description. A query waits for a free thread, of which an app has `limits.queryThreads`, 2 where the project states none, and none is started before the first heavy query. A heavy read that passes `queryTime` is stopped by ending its thread, and fails with `code.T0008`. Called by a query or a change, a heavy query runs where its caller runs. With a `store` of the program's own in `makers` there are no query threads, and a heavy query runs where every query does.
