# `useRun`

Follows a run from the code of a view: its steps, what each step says, its asks, what it used, and at its end its answer. It is the way to show any run the caller may follow - of an agent, of a flow or of an action - as it works.

## Example

```tsx
import { useState } from 'react'
import { screen, useCall, useRun } from 'tentjs/ui'
import { startImport } from '../functions/imports'

export const importScreen = screen('importScreen', {
  path: '/import',
  access: 'signedIn',
  view: () => {
    const begin = useCall(startImport)
    const [run, setRun] = useState<string | undefined>(undefined)
    const r = useRun(run)
    const done = r.said.at(-1)?.value
    return (
      <div className="import">
        <button type="button" onClick={() => void begin.call({}).then((answer) => setRun(answer.run))}>
          Import
        </button>
        <p>{r.state}: {JSON.stringify(done ?? null)}</p>
      </div>
    )
  },
})
```

## Takes

`useRun(run)`: the id of a run, or nothing while there is none. A page comes by the id from what started the run: `useAgent`, `runs` of a step, an action of the builder's own that calls `start(flow, input)` and answers `{ run }`, and `fields.run` of the T0008 that ends the wait of a caller of an action that is a run.

## Returns

`{ run, state, answer, reasoning, steps, asks, said, used, error }`, and `approve`, `refuse` and `stop` where an agent stands at the top of the run's calls, which call that agent's members.

`state` is `'idle'` before the page has heard of the run, and then `'queued'`, `'running'`, `'waiting'`, `'done'`, `'failed'` or `'stopped'`. `answer` is the text so far of a run of an agent, and at the end of a run of a flow or of an action its answer, through `output` of its definition. `said` holds the last value that each step said, as `[{ step, repeat, value }]`: the work of a step says it with `say(value)`, ten times a second at most, and it is never saved. `reasoning` is the reasoning of a `model` step of an agent that states `show` in `reasoning`.

A caller follows a run where they started the run at the top of its calls and the run lets them: an agent's run by its `access`, a run of a flow or of an action by its `follow`, and a run that runs as its starter under one they may follow. Any other run fails with `code.T0001`, and the hook holds that error.

## See also

`hook.useAgent`, `word.flow`, `topic.live`
