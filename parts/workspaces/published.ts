import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { App, OpenOptions } from '../engine/index.ts'
import type { Published } from '../publish/index.ts'
import { impactOf, publish } from '../publish/index.ts'
import type { Built } from './built.ts'
import { buildWorkspace } from './built.ts'
import type { Live } from './face.ts'
import { writeWorkspace } from './folder.ts'
import { checkedInBox, runWorkspace, trustedOwner } from './opening.ts'
import type { Held, One } from './state.ts'
import { historyOf, hostOf, oneOf } from './state.ts'

/** Whether where a workspace is made live is a far server, as a target of publishing is. */
const isTarget = (live: Live): live is { address: string; key: string } => 'key' in live

/** Where a workspace is made live, as the workspaces were told: T0013 where they were told nowhere. */
function liveOf(held: Held, one: One): Live {
  const live = held.o.live?.(one.workspace.id)
  if (!live)
    throw new TentError(
      'T0013',
      `The workspaces were given no \`live\`, so the workspace ${one.workspace.id} is made live nowhere.`,
      {
        fix: 'Give `createWorkspaces` a `live`, which answers where each workspace is made live.',
      },
    )
  return live
}

/** The folder of the newest bundle of a live app in the product's own engine, as the workspace keeps it. */
function newestLive(one: One): string | undefined {
  if (!existsSync(one.folders.live)) return undefined
  const [newest] = readdirSync(one.folders.live)
    .filter((name) => existsSync(join(one.folders.live, name, 'description.json')))
    .sort()
    .reverse()
  return newest === undefined ? undefined : join(one.folders.live, newest)
}

/**
 * What the product's own engine is handed to open the live app of a workspace with, with the `identify` of the
 * product, which names its callers as on the test side: code whose owner is not trusted
 * runs in the room of the workspaces, and nowhere where they hold none (T9105).
 */
async function liveOpen(held: Held, one: One, live: { dataFolder: string; address: string; sleepAfter?: string }) {
  const boxed = !(await trustedOwner(held, one))
  if (boxed && !held.o.room)
    throw new TentError(
      'T9105',
      `The workspace ${one.workspace.id} is code, and the workspaces hold no room to run it in.`,
      {
        fields: { rule: 'code' },
        fix: 'Give the workspaces a room to run in, or a role of the owner in `trusted`.',
      },
    )
  const options: OpenOptions = {
    dataFolder: live.dataFolder,
    address: [hostOf(live.address)],
    mode: 'live',
    ...(live.sleepAfter ? { sleepAfter: live.sleepAfter } : {}),
    // The live app knows its callers as its test side does: the product names its own user there.
    ...(held.o.identify ? { identify: held.o.identify } : {}),
    ...(boxed && held.o.room ? { makers: { room: held.o.room } } : {}),
  }
  return options
}

/**
 * Opens the live app of a workspace in the product's own engine, where it was published there and the engine does
 * not hold it yet: when the program started again, or for a folder that was put there while it ran.
 */
export async function openLive(held: Held, one: One): Promise<App | undefined> {
  if (one.live) return one.live
  const live = held.o.live?.(one.workspace.id)
  const bundle = newestLive(one)
  if (!live || isTarget(live) || !bundle) return undefined
  one.live = await held.o.engine.open(bundle, await liveOpen(held, one, live))
  return one.live
}

/**
 * Builds and checks what a workspace makes live in the product's own engine, into a folder of its live bundles: in
 * the program for a release where its owner is trusted, and in its box otherwise, whose bundle the host reads as data.
 */
async function liveBuilt(held: Held, one: One, boxed: boolean): Promise<Built> {
  const folder = join(one.folders.live, String(Date.now()).padStart(15, '0'))
  if (!boxed) return buildWorkspace(one.folders.project, folder, { for: 'release' })
  const built = await checkedInBox(held, one, 'release')
  if (built.versionId) cpSync(built.bundle, folder, { recursive: true })
  return {
    bundleFolder: built.versionId ? folder : '',
    versionId: built.versionId,
    description: built.description,
    findings: built.findings,
  }
}

/**
 * Takes what the workspaces hold, the id of a workspace and what the publish asks. Builds and checks its point and
 * makes it live where `live` says: on a far server by publishing, or in the product's own engine, by opening it
 * there the first time and by adding and switching to it afterwards. A workspace whose code its owner's roles do
 * not make trusted is published to a far server alone, with the bundle its box built: T9105 for the product's own
 * engine. The record of the workspace holds where it is live from then on. Answers what was published.
 */
export async function publishWorkspace(
  held: Held,
  id: string,
  asked: { try?: boolean; back?: boolean; stopRuns?: boolean; acceptImpact?: boolean } = {},
): Promise<Published> {
  const accepted = asked.acceptImpact === true
  const one = oneOf(held, id)
  const live = liveOf(held, one)
  await runWorkspace(held, id)
  const boxed = !(await trustedOwner(held, one))
  const history = historyOf(one)
  if (isTarget(live)) {
    // A publish of a workspace in a box sends what its box built and checked; any other is built and checked by it.
    const inBox = boxed ? await checkedInBox(held, one, 'release') : undefined
    const errors = inBox?.findings.filter((found) => found.level === 'error') ?? []
    if (inBox && (errors.length || !inBox.versionId))
      throw new TentError(
        'T9101',
        `The workspace ${id} does not pass the check, and is not published: ${errors[0]?.message ?? 'its box built no bundle'}`,
        {
          fields: { reason: 'check', count: String(errors.length) },
          fix: 'Mend what the check finds, and publish again.',
        },
      )
    const bundle = inBox?.bundle
    const answer = await publish({
      project: one.folders.project,
      history,
      to: live,
      fetch: held.o.fetch,
      ...(asked.try ? { try: true } : {}),
      ...(asked.back ? { back: true } : {}),
      ...(asked.stopRuns ? { stopRuns: true } : {}),
      ...(accepted ? { acceptImpact: true } : {}),
      ...(bundle ? { bundle } : {}),
    })
    if (!asked.try) {
      one.workspace.live = { version: answer.version, address: live.address }
      writeWorkspace(one.workspace)
    }
    return answer
  }
  const point = history.record(one.folders.project, {
    by: { kind: 'person', id: one.workspace.owner },
    kind: 'command',
  })
  const built = await liveBuilt(held, one, boxed)
  const errors = built.findings.filter((found) => found.level === 'error')
  if (errors.length || !built.versionId)
    throw new TentError(
      'T9101',
      `The workspace ${id} does not pass the check, and is not published: ${errors[0]?.message ?? ''}`,
      {
        fields: { point: point.id, reason: 'check', count: String(errors.length) },
      },
    )
  const opened = await openLive(held, one)
  // The impact of the change against what is live in the product's own engine, the one report of the publish.
  const impact = opened ? impactOf({ against: 'live', live: opened.description, next: built.description }) : undefined
  if (impact && !asked.try && !asked.back && !accepted && (impact.rights.length || impact.breaks.length))
    throw new TentError(
      'T9103',
      `The publish of the workspace ${id} widens ${impact.rights.length} rights and breaks ${impact.breaks.length} for callers outside, and its impact was not accepted.`,
      { fields: { reason: 'impact', count: String(impact.rights.length + impact.breaks.length) } },
    )
  const hard = asked.stopRuns ? { hard: 'stop' as const } : {}
  if (asked.back) {
    // Going back is to the version that ran before the one that runs, which the live app still keeps.
    const [before] = (opened?.versions() ?? []).filter((v) => !v.running).sort((a, b) => b.addedAt - a.addedAt)
    if (!opened || !before)
      throw new TentError('T9103', `The workspace ${id} has nothing live to go back to.`, {
        fields: { reason: 'nothing' },
      })
    const switched = await opened.switch(before.id, { back: true, ...hard, ...(asked.try ? { dry: true } : {}) })
    if (!asked.try) {
      one.workspace.live = { version: before.id, address: live.address }
      writeWorkspace(one.workspace)
    }
    return { version: before.id, point: point.id, hard: switched.hard, opens: switched.opens, breaks: [], findings: [] }
  }
  // A try changes nothing: where nothing is live yet, it says that the publish opens the app.
  if (asked.try && !opened)
    return { version: built.versionId, point: point.id, hard: false, opens: true, breaks: [], findings: built.findings }
  const app = opened ?? (await held.o.engine.open(built.bundleFolder, await liveOpen(held, one, live)))
  one.live = app
  const version = opened ? await app.add(built.bundleFolder) : built.versionId
  const switched = opened
    ? await app.switch(version, { ...(asked.try ? { dry: true } : {}), ...hard })
    : { hard: false, opens: false }
  if (!asked.try) {
    one.workspace.live = { version, address: live.address }
    writeWorkspace(one.workspace)
  }
  return {
    version,
    point: point.id,
    hard: switched.hard,
    opens: switched.opens,
    breaks: [],
    findings: built.findings,
    ...(impact ? { impact } : {}),
  }
}
