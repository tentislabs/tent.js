import type { FileName } from '../../data/index.ts'
import type { RunsAsked, RunView } from '../../flows/index.ts'
import type { App } from '../app.ts'
import { countsCallerHeld, countsPlan } from '../counts/readAlone.ts'
import { callerNamed } from '../program.ts'
import { endLater } from './endLater.ts'
import { holding, using } from './inUse.ts'
import type { Sleeping } from './sleeper.ts'
import { asleepError } from './sleeper.ts'

/**
 * Takes what an app that may sleep is held by, and its name. Answers its members: a member that answers a promise
 * wakes the app first, and is a use where it stands for a caller (`call`, `request`, `page`, `start`); a member that
 * answers at once is answered from what was kept where that is enough (`description`, `versions`), and else throws
 * T0013 while the app sleeps.
 */
export function sleepingMembers(s: Sleeping, name: string): App {
  /** The open app, for a member that answers at once. */
  const now = (): App => {
    const awake = s.awake()
    if (!awake) throw asleepError(name)
    return awake
  }
  /** Wakes the app, and carries out a member on it: counted as a use, or, where it is none, let fall asleep again after. */
  async function woken<T>(use: boolean, work: (app: App) => T | Promise<T>): Promise<T> {
    const app = await s.wake(!use)
    const o = s.opened()
    try {
      if (!o) return await work(app)
      return use ? await using(o, async () => work(app)) : await holding(o, async () => work(app))
    } finally {
      if (!use) s.ended()
    }
  }
  function find(o: RunsAsked & { of?: FileName }): RunView[]
  function find(o: RunsAsked & { of: 'all' }): Promise<RunView[]>
  function find(o: RunsAsked & { of?: FileName | 'all' }): RunView[] | Promise<RunView[]> {
    const { of, ...rest } = o
    if (of === 'all') return woken(false, (app) => app.runs.find({ ...rest, of }))
    return now().runs.find(of === undefined ? rest : { ...rest, of })
  }
  return {
    get description() {
      return s.description
    },
    role: 'writer',
    call: (...args) => woken(true, (app) => app.call(...args)),
    request: async (request, how) => {
      if (!s.awake()) {
        // A command that wakes nothing is answered as the door answers it, from this computer where none is given.
        const { protocol, host } = new URL(request.url)
        const scheme = protocol.replace(/:$/, '')
        const about = { from: how?.from ?? '127.0.0.1', scheme, host, origin: `${scheme}://${host}`, proxied: false }
        const own = await s.admin(request, about)
        if (own) return own
      }
      return woken(true, (app) => app.request(request, how))
    },
    // A live connection and a link answer at once: what is sent through them waits for the waking.
    live: (...args) => s.awake()?.live(...args) ?? endLater(s.wake().then((app) => app.live(...args))),
    read: async (plan, how) => {
      // The counts of an app that sleeps are read from its data, to read alone, and wake nothing.
      const counted = s.awake() ? undefined : countsPlan(plan)
      if (!counted) return woken(false, (app) => app.read(plan, how))
      countsCallerHeld(callerNamed(how?.as))
      return s.counts(counted)
    },
    write: (...args) => woken(false, (app) => app.write(...args)),
    page: (...args) => woken(true, (app) => app.page(...args)),
    session: (...args) => now().session(...args),
    shot: (...args) => woken(true, (app) => app.shot(...args)),
    export: (...args) => woken(false, (app) => app.export(...args)),
    standIn: (...args) => now().standIn(...args),
    seed: () => woken(false, (app) => app.seed()),
    snapshot: (...args) => woken(false, (app) => app.snapshot(...args)),
    restore: (...args) => woken(false, (app) => app.restore(...args)),
    facts: (...args) => woken(false, (app) => app.facts(...args)),
    values: (...args) => woken(false, (app) => app.values(...args)),
    caller: (...args) => woken(false, (app) => app.caller(...args)),
    logs: (...args) => woken(false, (app) => app.logs(...args)),
    link: (...args) => s.awake()?.link(...args) ?? endLater(s.wake().then((app) => app.link(...args))),
    at: () => now().at(),
    machines: () => now().machines(),
    workers: () => now().workers(),
    work: () => now().work(),
    release: (...args) => now().release(...args),
    filled: () => now().filled(),
    takeOver: () => woken(false, (app) => app.takeOver()),
    add: (...args) => woken(false, (app) => app.add(...args)),
    switch: (...args) => woken(false, (app) => app.switch(...args)),
    versions: () => s.versions(),
    drop: (...args) => woken(false, (app) => app.drop(...args)),
    show: (...args) => now().show(...args),
    inspect: (...args) => now().inspect(...args),
    close: () => s.close(),
    // What the fix of a member that answers at once names: it wakes the app as a request does, and is no use.
    ready: async () => {
      await s.wake()
    },
    start: (...args) => woken(true, (app) => app.start(...args)),
    runs: {
      read: (...args) => now().runs.read(...args),
      find,
      wait: (...args) => woken(false, (app) => app.runs.wait(...args)),
      approve: (...args) => now().runs.approve(...args),
      refuse: (...args) => now().runs.refuse(...args),
      stop: (...args) => now().runs.stop(...args),
      stopAll: (...args) => now().runs.stopAll(...args),
      replayAll: (...args) => now().runs.replayAll(...args),
      pause: (...args) => now().runs.pause(...args),
      resume: (...args) => now().runs.resume(...args),
      paused: () => now().runs.paused(),
    },
  }
}
