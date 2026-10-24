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

## Example

```ts
import { createEngine, type Clock } from 'tentjs/engine'

let moment = Date.UTC(2031, 0, 1)
const clock: Clock = { now: () => moment, setTimer: () => () => undefined }
const engine = createEngine({ makers: { clock: () => clock } })
```

## See also

`adapter.Store`, `adapter.Lease`
