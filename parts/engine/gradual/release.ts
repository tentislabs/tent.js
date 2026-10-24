import { createHash } from 'node:crypto'
import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { callerText } from '../../data/index.ts'

/** How a release is held to its watch: the share of failures more, the share of time more, and the calls each needs. */
export interface ReleaseWatch {
  failures: number
  slower: number
  calls: number
}

/** What a gradual release is asked with: its steps, the time at each, its watch, and what is told when it ends. */
export interface Gradual {
  steps?: number[]
  every?: number
  watch?: Partial<ReleaseWatch>
  // Told when the release was taken back or widened to every visitor, with why.
  told?: (release: ReleaseView) => void
}

/** A release as whoever follows it sees it: the two versions, the share of the new one, how it stands, and why. */
export interface ReleaseView {
  from: string
  to: string
  share: number
  step: number
  steps: number[]
  state: 'going' | 'back' | 'done'
  why?: string
}

/** What each version was answered with over the step under way: its calls, those that failed, and their times. */
interface Seen {
  calls: number
  failed: number
  times: number[]
}

/** A release while it goes, on the machine that decides it or on one that follows it. */
interface Release extends ReleaseView {
  every: number
  watch: ReleaseWatch
  seen: Map<string, Seen>
  cancel?: () => void
  told?: Gradual['told']
  // Widens the release to every visitor, where it is the machine that decides.
  widenAll?: () => Promise<void>
}

// The release of each app, by its handles, which every version of it shares.
const releases = new WeakMap<object, Release>()

/** The release of an app that goes or was taken back, as whoever follows it sees it, or nothing. */
export function releaseOf(o: Opened): ReleaseView | undefined {
  const held = releases.get(o.handles)
  if (!held) return undefined
  const { from, to, share, step, steps, state, why } = held
  return { from, to, share, step, steps, state, ...(why === undefined ? {} : { why }) }
}

/**
 * Takes an app and a caller. Answers the version the caller is given while a release goes: the new one for a share
 * of the callers, by a fingerprint of the caller's id against the release, so that one person stays on one version
 * on every machine, and the old one for every other. Nothing where no release goes: the running version serves.
 */
export function versionFor(o: Opened, caller: Caller): string | undefined {
  const held = releases.get(o.handles)
  if (!held) return undefined
  if (held.state === 'back') return held.from
  // A caller the door found no one in - a visitor with no id, the system - is on the old version.
  const who = callerText(caller)
  if (who === 'nobody' || who.startsWith('system')) return held.from
  const print = createHash('sha256').update(`${held.to}\n${who}`).digest()
  return print.readUInt32BE(0) / 0x1_0000_0000 < held.share ? held.to : held.from
}

/** The 95th share of a list of times. */
function p95(times: number[]): number {
  const sorted = times.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
}

/** Writes a line about the release into the log of the app, with its numbers. */
function said(o: Opened, message: string, data: object): void {
  o.log.write('lines', { at: o.clock.now(), level: 'warn', message, data: JSON.stringify(data) })
}

/** Takes the release back: every visitor is on the old version, and the new one stays loaded for its runs. */
function takenBack(o: Opened, held: Release, why: string): void {
  held.cancel?.()
  held.state = 'back'
  held.share = 0
  held.why = why
  said(o, `The release of ${held.to} was taken back: ${why}.`, { from: held.from, to: held.to, why })
  o.machine.writer?.toldVersions()
  held.told?.(releaseOf(o) ?? held)
}

/**
 * Takes the app a call was served by, how long the call took, and whether it failed for no fault of its caller.
 * While a release goes, it counts the call for its version, and takes the release back where the new version fails
 * more than the old one by `watch.failures`, or is slower at the 95th share by `watch.slower`, once each has had
 * `watch.calls` calls in the step under way.
 */
export function releaseCounted(o: Opened, ms: number, failed: boolean): void {
  const held = releases.get(o.handles)
  if (held?.state !== 'going' || !held.widenAll) return
  if (o.version !== held.from && o.version !== held.to) return
  const seen = held.seen.get(o.version) ?? { calls: 0, failed: 0, times: [] }
  seen.calls++
  if (failed) seen.failed++
  if (seen.times.length < 10_000) seen.times.push(ms)
  held.seen.set(o.version, seen)
  const [old, now] = [held.seen.get(held.from), held.seen.get(held.to)]
  if (!old || !now || old.calls < held.watch.calls || now.calls < held.watch.calls) return
  if (now.failed / now.calls - old.failed / old.calls > held.watch.failures) {
    takenBack(
      o,
      held,
      `the new version failed ${now.failed} of ${now.calls} calls, against ${old.failed} of ${old.calls} for the old one`,
    )
    return
  }
  const [slow, fast] = [p95(now.times), p95(old.times)]
  if (slow > fast * (1 + held.watch.slower))
    takenBack(
      o,
      held,
      `the new version answered in ${Math.round(slow)} ms at the 95th share of ${now.calls} calls, against ${Math.round(fast)} ms of ${old.calls} for the old one`,
    )
}

/** Moves the release one step on: to the next share, and at the last to every visitor, where the release ends. */
async function widened(o: Opened, held: Release): Promise<void> {
  if (held.state !== 'going') return
  held.cancel?.()
  held.step++
  const share = held.steps[held.step]
  if (share === undefined || share >= 1) {
    held.share = 1
    held.state = 'done'
    await held.widenAll?.()
    releases.delete(o.handles)
    said(o, `The release of ${held.to} was widened to every visitor.`, { from: held.from, to: held.to })
    held.told?.({ ...held })
    return
  }
  held.share = share
  held.seen = new Map()
  o.machine.writer?.toldVersions()
  held.cancel = o.clock.setTimer(o.clock.now() + held.every, () => void widened(o, held).catch(() => undefined))
}

/**
 * Takes an app, the version it runs, a loadable version, what the release is asked with, and what switches every
 * visitor to the new version at its end. Begins a gradual release: the new version is given its first share of
 * the callers, and is widened at the end of each step or taken back by its watch. Answers how it stands.
 */
export function beginRelease(
  o: Opened,
  to: string,
  asked: Required<Pick<Gradual, 'steps' | 'every'>> & { watch: ReleaseWatch; told?: Gradual['told'] },
  widenAll: () => Promise<void>,
): ReleaseView {
  releases.get(o.handles)?.cancel?.()
  const held: Release = {
    from: o.version,
    to,
    steps: asked.steps,
    step: 0,
    share: asked.steps[0] ?? 1,
    state: 'going',
    every: asked.every,
    watch: asked.watch,
    seen: new Map(),
    widenAll,
    ...(asked.told ? { told: asked.told } : {}),
  }
  releases.set(o.handles, held)
  held.cancel = o.clock.setTimer(o.clock.now() + held.every, () => void widened(o, held).catch(() => undefined))
  // An app that closes ends the timer of its release, which would otherwise widen an app that is gone.
  o.before.push({ close: () => held.cancel?.() })
  o.machine.writer?.toldVersions()
  return releaseOf(o) ?? held
}

/** Moves a release one step on by hand. Answers how it stands, or nothing where none goes. */
export async function widenRelease(o: Opened): Promise<ReleaseView | undefined> {
  const held = releases.get(o.handles)
  if (!held) return undefined
  await widened(o, held)
  return releaseOf(o) ?? { ...held }
}

/** Takes a release back by hand. Answers how it stands, or nothing where none goes. */
export function backRelease(o: Opened): ReleaseView | undefined {
  const held = releases.get(o.handles)
  if (held?.state !== 'going') return held ? releaseOf(o) : undefined
  takenBack(o, held, 'it was taken back by hand')
  return releaseOf(o)
}

/** Ends what a release holds of an app: a switch to another version, by itself, ends the release. */
export function endRelease(o: Opened): void {
  releases.get(o.handles)?.cancel?.()
  releases.delete(o.handles)
}

/**
 * On a machine that follows its writer: takes the share that the writer named with a version that does not run,
 * and gives each caller its version by it as the writer does. A list that names none ends the release here.
 */
export function followRelease(o: Opened, told: { version: string; running: boolean; share?: number }[]): void {
  const going = told.find((one) => !one.running && typeof one.share === 'number')
  if (!going || going.share === undefined) {
    releases.delete(o.handles)
    return
  }
  const held = releases.get(o.handles)
  const share = going.share
  if (held && held.to === going.version) {
    held.share = share
    held.state = share === 0 ? 'back' : 'going'
    return
  }
  releases.set(o.handles, {
    from: o.version,
    to: going.version,
    steps: [share],
    step: 0,
    share,
    state: share === 0 ? 'back' : 'going',
    every: 0,
    watch: { failures: 0, slower: 0, calls: 0 },
    seen: new Map(),
  })
}
