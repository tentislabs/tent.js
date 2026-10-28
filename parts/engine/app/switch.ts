import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import type { Gradual } from '../gradual/release.ts'
import { backRelease, beginRelease, endRelease, releaseOf, watchOf, widenRelease } from '../gradual/release.ts'
import { backupsOf, takeBackup } from '../backups.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { spanned } from '../trace/span.ts'
import { tellStale } from '../pages/stale.ts'
import { warmFor } from '../pages/warm.ts'
import { applyReleased, servedBy, switchVersion, writersOwn } from '../versions.ts'

// What a release takes where neither it nor the project states another: three steps, ten minutes each.
const steps = [0.05, 0.25, 1]
const every = 600_000

/**
 * Begins a gradual release of a loadable version, by what it is asked with and else by `release` of the version's
 * project. A version whose table change is hard cannot go gradually, since both versions run on one data: T9108,
 * which names the change.
 */
async function released(
  o: Opened,
  version: string,
  gradual: Gradual,
  backup: boolean,
): Promise<Awaited<ReturnType<App['switch']>>> {
  const to = servedBy(o, version)
  if (!to || to === o)
    throw new TentError(
      'T0007',
      `The version ${version.slice(0, 40)} cannot be loaded here, and is released to nobody.`,
    )
  const dry = await switchVersion(o, version, { dry: true })
  if (dry.hard)
    throw new TentError(
      'T9108',
      `The version cannot go gradually: its table change is hard, and both versions run on one data: ${dry.steps.map((step) => `${step.do} ${String(Reflect.get(step, 'table') ?? '')}${Reflect.get(step, 'column') ? `.${String(Reflect.get(step, 'column'))}` : ''}`).join(', ')}.`,
      {
        fields: { reason: 'hard', steps: dry.steps.map((step) => step.do).join(' ') },
        fix: 'Publish it whole, or add what the old version does not read first and remove it in a later version.',
      },
    )
  if (backup && backupsOf(to.description).beforeChanges) await takeBackup(o)
  // What the new version adds to the tables, which the old one runs on as before, is there for its share at once.
  await applyReleased(o, version)
  const stated: Record<string, unknown> = Object(to.description.project.release)
  const told = Array.isArray(stated.steps) ? stated.steps.map(Number) : undefined
  const watched: Record<string, unknown> = Object(stated.watch)
  const number = (one: unknown, held: number): number => (typeof one === 'number' ? one : held)
  const release = beginRelease(
    o,
    version,
    {
      steps: gradual.steps ?? told ?? steps,
      every: gradual.every ?? number(stated.every, every),
      watch: watchOf({
        ...Object.fromEntries(
          ['failures', 'slower', 'slowerBy', 'calls'].flatMap((name) =>
            typeof watched[name] === 'number' ? [[name, watched[name]]] : [],
          ),
        ),
        ...gradual.watch,
      }),
      ...(gradual.told ? { told: gradual.told } : {}),
    },
    async () => {
      await switchVersion(o, version, {})
    },
  )
  return { hard: false, opens: false, steps: [], release }
}

/** How a release stands, where one goes or was taken back. */
const releaseNow = (o: Opened) => {
  const release = releaseOf(o)
  return release ? { release } : {}
}

/**
 * `app.switch`: makes a loadable version the running one, with its table changes applied inside one write. It
 * answers whether the switch was hard, and the table steps it applied. With `dry` it also answers how many values
 * of each filled column whose work the version changes would become old. With `gradual` the version is given to a
 * share of the callers first, and widened or taken back, as a release that goes by hand is moved.
 */
export const member =
  (o: Opened): App['switch'] =>
  async (version, how) => {
    heldOpen(o)
    writersOwn(o, 'a switch')
    const gradual = how?.gradual
    if (gradual === 'status') return { hard: false, opens: false, steps: [], ...releaseNow(o) }
    if (gradual === 'widen') {
      const release = await widenRelease(o)
      return { hard: false, opens: false, steps: [], ...(release ? { release } : {}) }
    }
    if (gradual === 'back') {
      backRelease(o)
      return { hard: false, opens: false, steps: [], ...releaseNow(o) }
    }
    if (gradual !== undefined) return released(o, version, gradual, how?.backup === true)
    // In development the open pages load their address anew also where the version runs already, as a changed package asks.
    if (how?.reload === true && version === o.version) {
      if (o.mode === 'development') o.hub?.switched(version, [], { reload: true })
      return { hard: false, opens: false, steps: [] }
    }
    // A switch is a span of its own, with the version it went from and the one it went to.
    const from = o.version
    if (how?.dry !== true) {
      endRelease(o)
      // The addresses asked most are drawn into the cache of the new version before its visitors reach it.
      await warmFor(o, version)
    }
    const switched = await spanned(o, { name: 'switch', kind: 'switch', facts: { from, to: version } }, () =>
      switchVersion(o, version, how),
    )
    // A cache outside the engine is told that every public answer of the version that ran went stale.
    if (how?.dry !== true && o.version !== from) tellStale(o, { all: true, why: 'version' })
    const to = how?.dry === true ? servedBy(o, version) : undefined
    if (!to || to === o) return switched
    // What a publish tells before it is made: how many values each changed work makes old.
    const old = (await import('../fill/madeOld.ts')).madeOld(o, to)
    return old.length ? { ...switched, old } : switched
  }
