import { sweepAttempts } from './attempts.ts'
import { backupsOf, takeBackup } from './backups.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { forgetEnded, mayRemember } from './remember/kept.ts'
import { sweepHolds } from './stored/holdsSwept.ts'
import { asPiece } from './counts/cpu.ts'
import { sweepCallIds } from './door/callIds.ts'
import { sweepRates } from './door/rate.ts'
import { keepCounts } from './counts/kept.ts'
import { signsInPrograms } from './grants/programs.ts'
import { sweepSeen } from './incoming/seen.ts'
import { sweepSessions } from './sessions.ts'
import { sweepLoose } from './stored/loose.ts'

// The two lengths of the short beat: what each document says is done once a minute, and once an hour.
const minute = 60_000
const hour = 3_600_000

/** Where the upkeep of an app stands: when its daily work and its last backup ran, and the number of the write that backup held. */
export interface Upkept {
  daily: number
  backup?: number
  backupN?: number
}

/** The upkeep of an app, as the engine holds it. */
export interface Upkeep {
  close(): void
  /** Does the work of the short beat now, as before the app falls asleep: for an app that sleeps it is never due. */
  caughtUp(): void
  /** Where it stands now, to be carried on from after the app slept. */
  state(): Upkept
  /** The moments at which its daily work and its next backup are due. */
  next(): { daily: number; backup?: number }
  /** Carries on from where an earlier opening of the app stood: each piece of work is due a length of time after it last ran. */
  from(kept: Upkept): void
}

/** A piece of work done again and again by the clock of the app, each time a length of time after the last. */
interface Beat {
  last: number
  due(): number
  from(last: number): void
  stop(): void
}

/** Has a piece of work done again and again by the clock of the app, each time a length of time after the last, for as long as the app is open. */
function every(o: Opened, ms: number, work: () => void): Beat {
  let cancel = (): void => undefined
  const beat: Beat = {
    last: o.clock.now(),
    due: () => beat.last + ms,
    from(last) {
      cancel()
      beat.last = last
      arm()
    },
    stop: () => cancel(),
  }
  const arm = (): void => {
    cancel = o.clock.setTimer(beat.due(), () => {
      if (o.closed) return
      beat.last = o.clock.now()
      // The engine's own work for the app, which no call caused, books its processor time to `upkeep`.
      asPiece(o, 'upkeep', undefined, work)
      arm()
    })
  }
  arm()
  return beat
}

/** Has a piece of the upkeep done, and says so in the log where it fails: the next is done at its time all the same. */
function done(o: Opened, what: string, work: () => unknown): void {
  const failed = (error: unknown): void =>
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'error',
      message: `The upkeep of ${what} failed: ${String(error)}`,
    })
  try {
    const later = work()
    if (!(later instanceof Promise)) return
    const settled = later.catch(failed)
    o.inFlight.add(settled)
    void settled.finally(() => o.inFlight.delete(settled))
  } catch (error) {
    failed(error)
  }
}

/**
 * Takes what the engine holds of an app that has just opened, and whether it is a reader. Does the whole upkeep of
 * the app for as long as it is open, as the one home of its timers. On a short beat, at once and then every
 * minute: the ended windows of the rate and of `attempts`, the ids of `_t_once` past their keep, and the loose and
 * removed files; and every hour the sessions and the grants that ended. At once and every `limits.upkeepEvery`: the
 * holds, the spans, the remembered answers, the finished runs, the rows past their time, the counts, the files of
 * tenants and the store's optimiser. And a backup, as `backups` of the project says. A reader does the share of a
 * reader alone, and no backup. Answers a thing whose `close` takes the timers back, and what tells when each is due.
 */
export function keepUp(o: Opened, reads: boolean): Upkeep {
  const short = (): void => {
    done(o, 'the counts of the rate', () => sweepRates(o))
    done(o, 'the counts of attempts', () => sweepAttempts(o))
    done(o, 'the loose files', () => sweepLoose(o))
    if (reads) return
    done(o, 'the ids of calls', () => sweepCallIds(o))
    done(o, 'the ids of the calls coming in', () => sweepSeen(o))
  }
  const hourly = (): void => {
    done(o, 'the sessions', () => sweepSessions(o))
    if (signsInPrograms(o.description))
      done(o, 'the grants', () => import('./grants/kept.ts').then(({ sweepGrants }) => sweepGrants(o)))
  }
  // The daily work of the writer that is done at the opening too; the files of tenants are kept up by their opening.
  const day = (): void => {
    if (reads) return
    done(o, 'the holds of files', () => {
      sweepHolds(o)
      // The spans of the traces past `limits.traceKeep`.
      o.log.dropBefore('spans', o.clock.now() - storedLimit(o.description, 'traceKeep'))
      o.log.dropBefore('vitals', o.clock.now() - storedLimit(o.description, 'traceKeep'))
      // The remembered answers past their time, and those whose rows are gone.
      if (mayRemember(o)) forgetEnded(o)
    })
  }
  // At the opening, a waking among it, what is due is done before a request is answered.
  short()
  hourly()
  day()
  const shortBeat = every(o, minute, short)
  const hourBeat = every(o, hour, hourly)
  const daily = every(o, storedLimit(o.description, 'upkeepEvery'), () => {
    const { tenantFiles } = o
    if (tenantFiles)
      done(o, 'the data files of tenants', () =>
        import('./files/upkeep.ts').then(({ upkeepFiles }) => void upkeepFiles(o, tenantFiles, reads)),
      )
    day()
    if (reads) return
    o.flows?.upkeep()
    // The rows past the time their table keeps them.
    if (Object.values(o.description.tables).some((one) => typeof one.lasts === 'object'))
      done(o, 'the rows past their time', () => import('./aged.ts').then(({ removeAged }) => removeAged(o)))
    keepCounts(o)
    done(o, 'the store', () => o.store.optimize?.())
  })
  const { every: schedule } = backupsOf(o.description)
  let backupN: number | undefined
  const backups =
    schedule === false || reads
      ? undefined
      : every(o, schedule, () => {
          backupN = o.machine.at().n
          // A backup that fails has said so in the log, and the next one is taken at its time all the same.
          const taken = takeBackup(o).catch(() => undefined)
          o.inFlight.add(taken)
          void taken.finally(() => o.inFlight.delete(taken))
        })
  return {
    close() {
      shortBeat.stop()
      hourBeat.stop()
      daily.stop()
      backups?.stop()
    },
    caughtUp() {
      short()
      hourly()
    },
    state: () => ({
      daily: daily.last,
      ...(backups ? { backup: backups.last } : {}),
      ...(backupN === undefined ? {} : { backupN }),
    }),
    next: () => ({ daily: daily.due(), ...(backups ? { backup: backups.due() } : {}) }),
    from(kept) {
      daily.from(kept.daily)
      if (kept.backup !== undefined) backups?.from(kept.backup)
      if (kept.backupN !== undefined) backupN = kept.backupN
    },
  }
}
