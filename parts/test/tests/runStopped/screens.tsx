import { useState } from 'react'
import { screen, useCall, useRun } from 'tentjs/ui'
import { startWaiting } from './functions'

// A screen in code that starts a run of a flow, follows it, and stops it with `stop` of `useRun`.
export const waitScreen = screen('waitScreen', {
  path: '/wait',
  access: 'signedIn',
  view: () => {
    const begin = useCall(startWaiting)
    const [run, setRun] = useState<string | undefined>(undefined)
    const r = useRun(run)
    return (
      <main>
        <button
          type="button"
          onClick={() =>
            void begin.call({}).then((answer) => setRun(String(Reflect.get(Object(answer), 'run'))))
          }
        >
          Start
        </button>
        <button type="button" disabled={!r.stop} onClick={() => void r.stop?.()}>
          Stop
        </button>
        <span>State {r.state}</span>
        <span>Said {JSON.stringify(r.said.at(-1)?.value ?? null)}</span>
      </main>
    )
  },
})
