# `Room`

Where an app's code runs. Every call into the code of an app - a function, a rule, a flow, a route, `identify`, `onRequest`, a seed, a maker, a code screen, the program of a `python` or of an outside MCP server - goes through the app's room, which the program that holds the engine makes. Where it makes none, the code runs in the engine's own program (`inProgramRoom`), and a project that states `hold` gets the held room (`option.project.hold`).

## Interface

```ts
import type { Room, RoomInput } from 'tentjs/engine'
import { apartRoom, inProgramRoom } from 'tentjs/engine'

interface Makers { room?: (o: RoomInput) => Room }   // of a program alone: never of the bundle's engine.ts

interface RoomInput {
  app: string                                // the app's name
  dataFolder: string                         // which app of the program it is
  mode: Mode
  where: 'main' | 'query' | 'worker'         // the thread, or the machine, the room serves: one room for each
  ways: Ways                                 // how the room's code reaches the engine
}

interface Room {
  crosses: boolean                           // whether its code lives in a heap of its own
  load(version: RoomVersion): Promise<void>
  entry(version: string, entry: Entry): Called
  draw(version: string): Draw
  back(call: number, fn: number, args: unknown[], o: CallOptions): unknown
  program(o: ProgramStart): AppProgram
  unload(version: string): void
  close(): void | Promise<void>
}
```

A room that crosses is handed `ways`: the runtime slot, a `db` a call was handed, a function the engine handed in a call, and the guarded fetch, each carried out as the same call reaches it in the program. Values cross by the runtime's structured clone, with a function, a promise, a stream, a `db`, an error, a request and a response each carried by a mark; a value deeper than 64 or larger than `limits.valueSize` is `code.T0009`, and a callable used after its call `code.T0013`. Code past the time of its call ends with `code.T0008`, and code past the memory the room gives it with `code.T0037`; the room is made anew for the next call.

**Three rooms ship.** `inProgramRoom`, the default: the engine's own program, where nothing is copied and no call is numbered. The held room, what `hold` is: every kind of code in the program, and actions in a program of their own under the runtime's permission model. `apartRoom`, the test room: the code runs in a thread of its own, which shares nothing with the engine, and every call crosses, so a test shows what a room of a host would see. A host's own room - isolates, boxes around its programs, grouping by owner - is the host's.

## Example

```ts
import type { Room, RoomInput } from 'tentjs/engine'
import { apartRoom, createEngine } from 'tentjs/engine'

// Every app of this engine runs its code in the test room.
const room = (o: RoomInput): Room => apartRoom(o)
const engine = createEngine({ makers: { room } })
```

`tent test --room apart` runs an app's tests in the test room, and so does `TENT_ROOM=apart` for a run of tests.

## See also

`adapter.Sandbox`, `option.project.hold`, `command.test`, `code.T0037`
