# `Clock`

The clock of an app: the time, and a timer. The clock that ships is the clock of the system, and a test puts one of its own in its place.

## Interface

```ts
interface Clock {
  now(): number
  setTimer(at: number, fn: () => void): Cancel
}
type Cancel = () => void
```

`now` answers the moment in milliseconds since 1970, in UTC. `setTimer` has `fn` called once the clock stands at `at`, and answers a function that takes the timer back. The engine takes the moment of every call from it: what a query and a change are handed as `now`, the time of a row, and the time of a line of the log. A clock may have `close`, which the engine calls when the app is closed.

In a test app the clock is the test's: `app.clock.advance` and `app.clock.set` move it, and with `testApp({ clock: 'held' })` it stands still until they do (`option.testApp.clock`). Under `tent test`, `Date.now()`, `new Date()` and `Math.random()` in the app's own code read that clock and the source of the test's random seed, in the room of the program, the test room and the held room, while the test's own code reads the runtime's own. The engine makes the ids of an app's rows by its clock and its source too. A program gives that source beside the clock, as `makers.random`, a function that answers a number from 0 up to 1: a test app gives the one of its random seed. The bundle's `engine.ts` gives none, and the source is then the runtime's own.

## Example

```ts
import { createEngine, type Clock } from 'tentjs/engine'

let moment = Date.UTC(2031, 0, 1)
const clock: Clock = { now: () => moment, setTimer: () => () => undefined }
const engine = createEngine({ makers: { clock: () => clock } })
```

## See also

`adapter.Store`, `adapter.Lease`, `option.testApp.clock`
