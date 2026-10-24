# Many machines, tenants and programs

This page says how live data works on several machines, over the files of tenants, and from a program.

## On several machines

A reader serves live pages by itself. Each change that it applies is a write of its own store, so its hub runs the groups that read what the change touched, and sends each page what its own machine holds, in the order that machine applied it. A change of raw SQL that states its tables runs the groups that read one of them, and one that states nothing runs every group. No watch reaches the writer.

No `result` and no `rows` leaves a machine before the write it stands at is settled: on the writer too, a page is sent a row only once every near reader that is waited for holds it. Each carries `at`, in the form of `Tent-At`. The page code keeps the latest write it has seen, in an answer or in a message, and names it as `Tent-After` in every request and as `seen` in every watch. A watch whose `seen` this reader does not hold yet is answered once it holds it, or once it has applied the number in the answer to a beat that it sent after the watch arrived: so a made-up number costs one beat. A far reader holds the answer of a call that it handed to the writer until it has applied that write and sent its pages what the write changed.

A reader that is not current closes its live connections, and refuses a new one with `code.T0029`, until it is current again: a watch cannot be handed to the writer. The page then reads through the door, which the reader hands on.

## Over the files of tenants

On an app that keeps a data file for each tenant, a group follows each table that its run read, with the file it read it in: a write to that table in the file of one of those tenants runs the group again, and a write to another table of that file, or to the file of any other tenant, does not. A file that raw SQL read is followed as a whole. A tenant that has no file yet is followed too, so its page is sent its first row. A query that reads several tenants in turn is one query to a live page.

## From a program

`app.live(request)` opens the live connection with no network. It passes the same steps of the door as the opening of the WebSocket, and throws what the opening was refused with. It answers the end that a page would hold.

```ts
import { buildProject } from 'tentjs/build'
import { createEngine } from 'tentjs/engine'

const { bundleFolder } = await buildProject('.', { for: 'release' })

const engine = createEngine({ port: 3000 })
const app = await engine.open(bundleFolder, { dataFolder: '.tent' })
const origin = 'http://localhost:3000'
const live = app.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
live.each(
  (message) => console.log(message.t, message.id),
  () => console.log('closed'),
)
live.send({ t: 'watch', id: 'open', query: 'openNotes', input: {} })
```

`send` hands the engine one message. `each` names what is handed every message that arrives, in order, and what is told once the connection is closed by either side. `close` closes it.

The code of the hub, and the WebSocket part that the engine borrows, are loaded when the first live connection is opened: an app that no page watches holds neither.

## See also

`topic.engine`, `topic.screens`, `hook.useQuery`, `hook.useCall`, `option.query.live`, `option.query.refresh`, `option.query.heavy`, `option.project.limits`, `code.T0004`, `code.T0005`, `code.T0007`, `code.T2108`
