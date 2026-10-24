# T7114 driver-missing

An agent names in `driver` a driver that nobody made in `engine.ts`, so the app does not open.

## The fix

Make the driver in `drivers` of the makers of `engine.ts`, by the name the agent gives, or take `driver` away so that the engine's own loop runs the agent. A driver is made from the `env` that the engine's own is made from, and answers the body of a run.

```ts
// engine.ts
import type { Makers } from 'tentjs/engine'
export default {
  drivers: () => ({ planner: (env) => async (run) => ({ text: 'planned' }) }),
} satisfies Makers
```

## See also

`option.agent.driver`, `word.agent`
