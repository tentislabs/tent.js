# `Lease`

What names the one writer of an app on many machines, so that a reader takes over by itself. Nothing ships: with no lease a person says which machine is the writer.

## Interface

```ts
interface Lease {
  hold(o: { app: string; mode: Mode; machine: string; forMs: number }): boolean | Promise<boolean>
}
```

`hold` is asked by the machine that is the writer, or wants to be: it answers whether that machine holds the lease of the app for the next `forMs` milliseconds. Whatever stands behind it must give the lease to one machine at a time. A lease may have `close`, which the engine calls when the app is closed.

## Example

```ts
import { createEngine, type Lease } from 'tentjs/engine'

const lease: Lease = { hold: ({ machine }) => machine === process.env.WRITER }
const engine = createEngine({ makers: { lease: () => lease } })
```

## See also

`adapter.Clock`, `adapter.Store`
