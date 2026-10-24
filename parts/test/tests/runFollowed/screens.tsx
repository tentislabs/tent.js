import { useState } from 'react'
import { screen, useCall, useRun } from 'tentjs/ui'
import { startCounting } from './functions'

// A screen in code that starts a run and follows it: what its step says, and its answer at the end.
export const countScreen = screen('countScreen', {
  path: '/count',
  access: 'signedIn',
  view: () => {
    const begin = useCall(startCounting)
    const [run, setRun] = useState<string | undefined>(undefined)
    const r = useRun(run)
    const said = r.said.at(-1)?.value
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          onClick={() =>
            void begin.call({}).then((answer) => setRun(String(Reflect.get(Object(answer), 'run'))))
          }
        >
          Count
        </button>
        <p id="said">Said {JSON.stringify(said ?? null)}</p>
        <span>State {r.state}</span>
        <p id="answer">Answer {JSON.stringify(r.answer ?? null)}</p>
      </main>
    )
  },
})
