import type { WireError } from '../../core/index.ts'
import { useEffect, useRef, useState } from '../borrowed/react.ts'
import { named } from '../page/based.ts'
import { useStore } from '../page/context.ts'
import type { AskShown, FollowedRun, SaidShown, StepShown } from '../page/followed.ts'
import { seenOf } from '../page/press.ts'
import type { Stub } from '../travelled.ts'

/** What `useAgent` gives: the run that is shown, as far as the page has heard of it, and what acts on it. */
export interface AgentShown {
  send(message: string, o?: { files?: string[]; audio?: string }): Promise<void>
  run?: string
  state: 'idle' | 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped'
  // The text of the latest `model` step, as far as it has come, and its reasoning where the agent states `reasoning`.
  answer: string
  reasoning: string
  steps: StepShown[]
  said: SaidShown[]
  asks: AskShown[]
  approve(ask: AskShown): Promise<void>
  refuse(ask: AskShown): Promise<void>
  used: Record<string, number>
  error?: WireError
  stop(): Promise<void>
}

const states = ['queued', 'running', 'waiting', 'done', 'failed', 'stopped'] as const

/** The state of a run as the hook gives it: one of the six, or idle before the page has heard of the run. */
const stateOf = (held: FollowedRun | undefined): AgentShown['state'] =>
  states.find((one) => one === held?.state) ?? 'idle'

/** The key under which the page keeps the latest run of an agent with no conversation, for a reload. */
const keptAs = (agent: string): string => `tent.run.${agent}`

/** The session storage of the browser, where there is one. */
function session(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Takes an agent as a screen file imported it, and `{ thread, speak }`. Answers the run that the page shows:
 * `send` starts one through the door and follows it over the live connection, `approve` and `refuse` answer an
 * ask, and `stop` stops it, and the playing of its sounds. After a reload it follows its run again: with a
 * `thread` the caller's latest run on that conversation, which `working` names, and without one the run it kept
 * in the page's session storage. On the server it is idle.
 */
export function useAgent(agent: Stub, o: { thread?: string; speak?: boolean } = {}): AgentShown {
  const store = useStore()
  const name = agent.definition
  const [run, setRun] = useState<string | undefined>(undefined)
  const [, setTurn] = useState(0)
  const [error, setError] = useState<WireError | undefined>(undefined)
  // The sentences of the run that were played, by their files: a connection that comes back sends the run anew
  // with no sound, and the sentences that follow are each played once. `ended` is set where nothing more is played.
  const played = useRef<{ done: Set<string>; playing?: HTMLAudioElement; ended?: true }>({ done: new Set() })
  const { thread } = o

  // The run that the page shows after a reload: the latest one on the conversation, or the one it kept.
  useEffect(() => {
    if (thread === undefined) {
      const kept = session()?.getItem(keptAs(name))
      if (kept) setRun(kept)
      return
    }
    let gone = false
    void store.call(`${name}.working`, { thread }).then(
      (entries) => {
        const [latest] = (Array.isArray(entries) ? entries : []).filter(
          (one) => Reflect.get(Object(one), 'theirs') !== true,
        )
        const id: unknown = Reflect.get(Object(latest), 'run')
        if (!gone && typeof id === 'string') setRun(id)
      },
      () => undefined,
    )
    return () => {
      gone = true
    }
  }, [name, thread, store])

  // The run that is shown is followed over the live connection while the view shows it.
  useEffect(() => {
    if (run === undefined || !store.follow) return
    played.current = { done: new Set() }
    const stop = store.follow(run, () => setTurn((turn) => turn + 1))
    // A sound of a run that the view no longer shows, as when it left or a new run began, is heard no more.
    return () => {
      stop()
      played.current.playing?.pause()
      played.current = { done: new Set(), ended: true }
    }
  }, [run, store])

  const held = run === undefined ? undefined : store.followed?.(run)

  // Each spoken sentence is played in its order, once the one before has ended.
  useEffect(() => {
    if (!o.speak || !held || typeof Audio === 'undefined') return
    const now = played.current
    const next = held.sounds.find((file) => !now.done.has(file))
    if (now.playing || now.ended || next === undefined) return
    const sound = new Audio(named(store.page, `/_t/files/${next}`))
    now.done.add(next)
    now.playing = sound
    sound.onended = () => {
      now.playing = undefined
      setTurn((turn) => turn + 1)
    }
    void sound.play().catch(() => {
      now.playing = undefined
    })
  })

  const acted = async (member: string, input: object): Promise<void> => {
    try {
      await store.call(`${name}.${member}`, input)
    } catch (thrown) {
      setError(seenOf(thrown))
    }
  }

  return {
    async send(message, more = {}) {
      setError(undefined)
      try {
        const answer = await store.call(name, {
          message,
          ...(thread === undefined ? {} : { thread }),
          ...(more.files?.length ? { files: more.files } : {}),
          ...(more.audio === undefined ? {} : { audio: more.audio }),
          ...(o.speak ? { speak: true } : {}),
        })
        const id: unknown = Reflect.get(Object(answer), 'run')
        if (typeof id !== 'string') return
        if (thread === undefined) session()?.setItem(keptAs(name), id)
        setRun(id)
      } catch (thrown) {
        setError(seenOf(thrown))
      }
    },
    ...(run === undefined ? {} : { run }),
    state: stateOf(held),
    answer: held?.text ?? '',
    reasoning: held?.reasoning ?? '',
    steps: held?.steps ?? [],
    said: held?.said ?? [],
    asks: held?.asks ?? [],
    approve: (ask) => acted('approve', { run: ask.run, step: ask.step, repeat: ask.repeat, n: ask.n }),
    refuse: (ask) => acted('refuse', { run: ask.run, step: ask.step, repeat: ask.repeat, n: ask.n }),
    used: held?.used ?? {},
    ...((error ?? held?.error) ? { error: error ?? held?.error } : {}),
    async stop() {
      played.current.playing?.pause()
      played.current = { done: new Set(), ended: true }
      if (run !== undefined) await acted('stop', { run })
    },
  }
}
