# `Workers`

What starts and stops the machines that heavy work runs on, by what waits and what is idle. Nothing ships: the engine starts no machine, and whoever runs the machines starts the workers, by this or by a tool of its own.

## Interface

```ts
interface Workers {
  need(o: {
    app: string
    mode: Mode
    kind: string
    waiting: number
    heldBack: number
    oldest: number
    limits?: { unit: string; limit: number; used: number; reserved: number }[]
  }): void
  idle(o: { app: string; mode: Mode; kind: string; worker: string; since: number }): void
}
```

`need` is told, for a kind of worker, what waits for it: how many tasks, how many of those a limit of use holds back, which no machine can take (`heldBack`), the age of the oldest in milliseconds, and, where the kind states limits of use, each with what was used and what is reserved. It is told when work begins to wait, again every `limits.needEvery` (10 seconds) while any waits, and once with `waiting: 0` when none waits any more. `idle` names a worker that had nothing to do for `idleAfter` of its kind, from the moment `since`, and is told again every `needEvery` while that stays so: a machine is stopped once its worker was released with `app.release` and holds nothing. What either throws is logged, and changes nothing. `app.work()` and `app.workers()` answer the same to a host that asks.

## Example

```ts
// engine.ts
import type { Makers, Workers } from 'tentjs/engine'

const machines = (key: string): Workers => ({
  need: ({ kind, waiting }) => {
    if (waiting > 0) void fetch(`https://machines.example.com/start?kind=${kind}`, { method: 'POST', headers: { authorization: key } })
  },
  idle: ({ worker }) => {
    void fetch(`https://machines.example.com/stop?worker=${worker}`, { method: 'POST', headers: { authorization: key } })
  },
})
export default { workers: ({ secrets }) => machines(secrets.MACHINES_KEY.reveal()) } satisfies Makers
```

## See also

`topic.workers`, `option.project.limits`
