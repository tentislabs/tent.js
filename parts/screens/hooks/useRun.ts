import type { WireError } from '../../core/index.ts'
import { useEffect, useState } from '../borrowed/react.ts'
import { useStore } from '../page/context.ts'
import type { AskShown, SaidShown, StepShown } from '../page/followed.ts'
import { seenOf } from '../page/press.ts'

/** What `useRun` gives: a run the caller may follow, as far as the page has heard of it. */
export interface RunShown {
  run?: string
  state: 'idle' | 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped'
  // The text so far of a run of an agent, and at the end of a run of a flow or of an action its answer.
  answer: unknown
  reasoning: string
  steps: StepShown[]
  asks: AskShown[]
  said: SaidShown[]
  used: Record<string, number>
  error?: WireError
  // Where an agent stands at the top of the run's calls: its members, which act on the run. `stop` is also
  // given for a run of a flow or of an action whose definition takes `{ run, stop: true }`.
  approve?(ask: AskShown): Promise<void>
  refuse?(ask: AskShown): Promise<void>
  stop?(): Promise<void>
}

const states = ['queued', 'running', 'waiting', 'done', 'failed', 'stopped'] as const

/**
 * Takes the id of a run, or nothing while there is none. Follows that run over the page's live connection while
 * the view shows it, as `useAgent` follows its own: its steps, what they say, its asks and what it used, and
 * at its end its answer. Where an agent stands at the top of its calls it gives `approve`, `refuse` and `stop`,
 * which call that agent's members; for a run of a flow or of an action whose definition takes
 * `{ run, stop: true }` it gives `stop`, which makes that call. On the server, and before the page has heard of the
 * run, it is idle.
 */
export function useRun(run: string | undefined): RunShown {
  const store = useStore()
  const [, setTurn] = useState(0)
  const [error, setError] = useState<WireError | undefined>(undefined)

  useEffect(() => {
    if (run === undefined || !store.follow) return
    return store.follow(run, () => setTurn((turn) => turn + 1))
  }, [run, store])

  const held = run === undefined ? undefined : store.followed?.(run)
  const agent = held?.agent
  const flow = held?.flow
  const called = async (name: string, input: object): Promise<void> => {
    try {
      await store.call(name, input)
    } catch (thrown) {
      setError(seenOf(thrown))
    }
  }
  const asked = (ask: AskShown): object => ({ run: ask.run, step: ask.step, repeat: ask.repeat, n: ask.n })
  return {
    ...(run === undefined ? {} : { run }),
    state: states.find((one) => one === held?.state) ?? 'idle',
    answer: held?.answer ?? (agent ? held?.text : undefined),
    reasoning: held?.reasoning ?? '',
    steps: held?.steps ?? [],
    asks: held?.asks ?? [],
    said: held?.said ?? [],
    used: held?.used ?? {},
    ...((error ?? held?.error) ? { error: error ?? held?.error } : {}),
    ...(agent && run !== undefined
      ? {
          approve: (ask: AskShown) => called(`${agent}.approve`, asked(ask)),
          refuse: (ask: AskShown) => called(`${agent}.refuse`, asked(ask)),
          stop: () => called(`${agent}.stop`, { run }),
        }
      : flow && run !== undefined
        ? { stop: () => called(flow, { run, stop: true }) }
        : {}),
  }
}
