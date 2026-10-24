# `Driver`

The body of an agent's run, in place of the engine's own loop: a builder writes another loop - plan first, ask several models - and keeps the members, the asks, memory and what a tool call may do. An agent names it in `driver`.

## Interface

```ts
interface Makers {
  drivers?: (o: MakerInput) => Record<string, (env: AiEnv) => Driver>   // by the name an agent gives in `driver`
}

type Driver = (run: {
  id: string
  top: string
  version: string
  record: object
  input: unknown
  event: unknown
  given?: object
  starter: Caller
  leave?: Leave
  startedAt: number
  step: DriverSteps
  signal: AbortSignal
  worked(): number
  handOver(to: string): void
}) => Promise<unknown>
```

Each entry of `drivers` is made once for each name, from the same `env` that the engine's own loop is made from: the description, the guarded fetch, the secrets, the limits of use, the files, the providers, and `call(name, args)`, which makes a call of the runtime in the call context of the step it is made in, as `writer.reply(...)` is `call('writer.reply', [...])` in app code. `run.step` is the step of a flow: what it does is saved, so a run that is stopped goes on from its last step. Its steps are tried once: a tool that fails is told to the model. What the driver answers is the answer of the run. `handOver(to)` says that another agent holds the conversation from the write that ends the run.

`run.step(name, work, o)` takes, of the options of a step, `tries`, `leave`, `show`, `background`, `worker`, `rows`, `time` and `reserve`, and has the tools `wait`, `waitFor`, `all`, `first`, `now` and `random` (`topic.flows`). The work of a step is handed the working handle of a step: `say(value)` tells whoever follows the run what the step says now, which `said` of `useAgent` shows; `progress`, `stopping()` and `back()` are a step's own, as in a flow.

What `env` gives:

| Member | Is |
|---|---|
| `call(name, args)` | A call of the runtime, made as the starter of the run, in the call context of the step it is made in: a function by its name with `[input]`, a model call as `call('writer.reply', [...])`, a service call as `call('slack.postMessage', [...])`. A function is held to its own rule for that starter, as a call from the starter's page is, so one that its `access` keeps from them is `code.T3101` |
| `allow({ model, call, caller, run })` | Holds the limits of a model for a caller, and of the run, before a call that the driver makes itself: one that was reached throws `code.T7102` |
| `used({ name, answeredBy, kind, caller, run, units, ms, ok })` | Books what such a call used in the counts and the log, as the model layer does: `units` as `{ tokensIn, tokensOut }` |
| `tell(run, part)` | Tells whoever follows the run a part: `{ kind: 'text', step, text }`, the next piece of the answer of that step, which `answer` of `useAgent` shows as it grows, and `{ kind: 'reasoning', step, text }` |
| `description(version)` | The description of the version the run works on, `run.version` |
| `fetch`, `secret(name)` | The guarded fetch, and the value of a secret |
| `files` | `text(id, caller)`, `bytes(id, caller)`, `info(id, caller)` of a file the caller may read, and `put(bytes, { name, kind }, { caller, run })`, which keeps a new one and answers its id |
| `providers`, `standIn(model)` | The providers made in `engine.ts`, by name, and the stand-in of a test for a model, where `app.fake` made one |
| `now()`, `sleep(ms)` | The engine's clock, which the clock of a test moves |

A driver is the whole body of the run. What the engine's own loop does with the other options of the agent - its `tools`, `memory`, `questions`, `trust`, `guards`, `knows`, `handsOver` and `voice` - is that loop's: a driver of your own reads them from `run.record`, the record of the agent, and does what it keeps of them itself. A memory table states no `add` rule, so a driver writes its rows through a change of the app that states `system`; the rows are those of `code.T7007`, so a chat screen draws them as it draws the engine's own.

`Driver` and `DriverSteps` are declared in `tentjs/flows`, and `AiEnv` in `tentjs/ai`, which `tentjs/engine` gives again: `engine.ts` imports them as types. An agent that names a driver that nobody made stops the app from opening (`code.T7114`).

## Example

```ts
// agents/helper.ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with orders.',
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  driver: 'planner',
})

// engine.ts
import type { AiEnv, Makers } from 'tentjs/engine'
import type { Driver } from 'tentjs/flows'

const planner = (env: AiEnv): Driver => async ({ input, step }) => {
  const plan = await step('plan', () => env.call('writer.reply', [`Plan the steps for: ${JSON.stringify(input)}`]))
  return step('answer', () => env.call('writer.reply', [`Follow this plan: ${JSON.stringify(plan)}`]))
}

export default { drivers: () => ({ planner }) } satisfies Makers
```

## See also

`option.agent.driver`, `word.agent`, `adapter.Provider`, `topic.flows`
