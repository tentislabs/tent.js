# The engine in a program of your own

The engine is the program that runs apps. `tent start` is one engine with one app. A program of your own may hold an engine with many apps, each a bundle and a data folder.

## One engine, many apps

```ts
import { createEngine } from 'tentjs/engine'

const engine = createEngine({ port: 3000 })
const app = await engine.open('.tent/build/4f1c0d2a', { dataFolder: 'data/shop', mode: 'live' })
const open = await app.call('openOrders', { limit: 5 }, { as: { kind: 'system' } })
await engine.close()
```

A program imports the framework as it imports any package: `tentjs/engine`, `tentjs/workspaces`, `tentjs/connect` and every other import of these docs are found in the `tentjs` that the project holds. A program is started as any program of Node.js, in the folder of the project: `node server.ts`, with Node.js 26, which runs a `.ts` file with its types taken off. `tent test` and `tent check` find them by themselves, in a test file too.

`engine.open` reads the description of the bundle, opens the data, applies the table changes, loads the code and answers the app. It never builds. Where anything fails the app does not open: `code.T0011` for a description that does not pass, `code.T0018` for data that cannot be opened, `code.T2001` to `code.T2004` for a table change that is refused, with nothing changed.

`mode` says where the app is: `'development'`, `'test'` or `'live'`, which holds where none is named. In development a version is the list of its files: each file is kept once, by the fingerprint of its bytes, and a save writes only the files it changed and the list. In the other two the engine copies the bundle into `versions/` of the data folder and runs it from there.

## An app that nothing uses sleeps

`secretKey` of `engine.open` is the key of the secrets of that app alone, as `tent secrets key` prints one: the app seals and opens with it, in place of `TENT_SECRET_KEY` of the program and of `secret.key` of its data folder, and writes it nowhere. A program that holds the apps of many owners hands each its own; a preview is opened so.

Where a program holds many apps, an app that nobody uses need hold no memory. `sleepAfter` of `engine.open` is a length of time: an app that was not used for that long falls asleep, and is woken by whatever next needs it.

```ts
const app = await engine.open(bundle, { dataFolder: 'data/shop', sleepAfter: '15 minutes' })
await app.ready() // wakes it, and answers when it is open
```

An app is in use while a request of it is answered, while a live connection or the link of a worker is open, while a run of it works or work of it is out on a worker, and while work of the engine's own for it is under way. A run that waits and a schedule are no use. An app that sleeps gives back its store, its threads, its timers and what its makers made but its clock, and writes `asleep.json` with what is due. A request for one of its names wakes it, after `onRequest` of `createEngine`; so do its due moment, also after the program was started again, and a member of `App` that answers a promise. `description` and `versions` answer while it sleeps, and every other member that answers at once is `code.T0013`. `/_t/health` neither wakes it nor counts as a use. Left out, an app never sleeps, and an app with readers never does.
