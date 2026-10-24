# Workspaces: apps that your users build

A product is an app whose users build apps inside it, by hand or with an AI. Each of them works in a workspace: one person's project, with its own data and its own history, which runs beside the product in the same engine and is tried while it is built. `tentjs/workspaces` makes them.

## Making the workspaces

The product is an app like any other, with one small program around it that makes the engine, opens the product's app and makes its workspaces:

```ts
import { guardedFetch } from 'tentjs/connect'
import { createEngine } from 'tentjs/engine'
import { createWorkspaces } from 'tentjs/workspaces'

const engine = createEngine({ port: 3000 })
const app = await engine.open('./bundle', { dataFolder: './data', address: 'builder.example', mode: 'live' })
const workspaces = createWorkspaces({
  engine,
  app,
  folder: './workspaces',
  address: (id) => `https://${id}.apps.example`,
  fetch: guardedFetch({ mode: 'live' }),
  templates: { blank: './templates/blank' },
  identify: async ({ request, db, call }) => findOrAddUser(request, db, call),
  live: (id) => ({ dataFolder: `./live/${id}`, address: `https://${id}.live.example` }),
})
```

`createWorkspaces` puts its own `onRequest` in front of the engine's, gives the product's app the handle `workspaces` (`handle.workspaces`) and opens every workspace and every live app it finds in its folder. A request for the name of a workspace opens it where the engine does not hold it yet, also for a folder that was put there while the program ran.

| Option | Holds |
|---|---|
| `engine`, `app` | The engine, and the product's own app: the one whose users own the workspaces and whose agent builds |
| `folder` | The folder that holds a folder for each workspace |
| `address(id)` | The address at which the app of a workspace answers |
| `fetch` | The guarded fetch with which a workspace is published to a far server |
| `live(id)` | Where `publish` makes a workspace live: `{ dataFolder, address, sleepAfter? }` in the product's own engine, or a `Target` `{ address, key }` of a far server |
| `templates` | The templates a workspace begins from, each by its name, as a folder |
| `identify` | Who calls the app of a workspace, on its test side and where it is live in the product's own engine, as `identify` of a project: the product names its own user there. The program holds no definition of a workspace, so its `call` names one by its record: `call({ kind: 'change', definition: 'addUser' }, { email })` |
| `trusted` | The roles of the product whose holders may build and run code in the engine itself |
| `sandbox` | The place where a workspace with code of anyone else is built (`adapter.Sandbox`); where it is left out, the one that the makers of the product's app made |
| `room` | The room in which the app of a workspace with code of anyone else runs in the product's engine (`adapter.Room`); with none, such a workspace is neither built nor run |
| `sleepAfter` | How long a workspace may stand unused before it falls asleep: 10 minutes where it is left out |
| `framedBy` | The sites that may show every screen of a workspace in a frame: the product's own address |
| `mail` | `true` sends the mail of the test side; where it is left out it is written down, and `mail` reads it |
| `counting` | What is counted of each workspace, and how often: `countBy`, `countEvery`, `levelEvery`, `callerCountsKept`, `countsKept` |
| `may(caller, workspace)` | Lets a caller who is not the owner into a workspace |
| `turnsKept` | How many turns keep their snapshot of the data for an undo: 20 where it is left out |

**The person of a workspace.** `identify` is handed the request as the app of the workspace sees it: every cookie of the product's own app, its session among them, is taken out of it, since the code of a workspace is not the product's. So the product names its person to it by a mark of its own, under a name that does not start with `tent_`: a token that the product makes and signs for that person and that workspace, which it hands the browser as a cookie of its own for a parent name that the names of the workspaces share, set by an answer of its `onRequest` or of a route, or in the address of the frame, and which `identify` reads, checks and turns into the id of a user of the workspace's app. The program's `onRequest` learns whose request of the product it holds with `app.caller(request)` of the product's app, which reads its session as the door does (`topic.engine.web`), before it makes that token.

**A faked model in a program.** A program that holds the product fakes the model of its agent by handing the engine a provider of its own under the name of the model's provider, `createEngine({ makers: { providers: () => ({ anthropic: fake }) } })`, where `fake` is a `Provider` whose `reply` gives the parts of each answer (`adapter.Provider`). A test app fakes one with `app.fake` (`topic.tests.model`).
