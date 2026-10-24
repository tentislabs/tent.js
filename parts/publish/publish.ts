import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardedFetch } from '../connect/index.ts'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { fingerprintOf, write } from '../core/internal.ts'
import type { Change, History, Point, Writer } from '../history/index.ts'
import { idOf } from '../history/index.ts'
import { blobsOf } from './blobsBody.ts'
import { breaks } from './breaks.ts'
import type { Impact, ImpactFacts } from './impact/face.ts'
import { impactOf, noImpact } from './impact/impact.ts'
import { keepImpact } from './impact/kept.ts'
import { lackingThere, sendBundle, sendPoints } from './send.ts'
import type { Target } from './target.ts'
import { reportOf } from './impact/report.ts'
import { asked } from './target.ts'

/** What a publish answers: the version, the published point, what the switch was, what breaks, and what was found. */
export interface Published {
  version: string
  point: string
  hard: boolean
  opens: boolean
  breaks: Change[]
  findings: Finding[]
  refused?: string
  live?: string
  // Of a target that keeps a data file for each tenant: how many files are behind the running layout.
  behind?: number
  // For each filled column whose work the version changes: how many values become old, and `perDay` of its `by`.
  old?: { table: string; column: string; old: number; perDay?: Record<string, number> }[]
  // Of a preview: the address the branch answers at.
  preview?: string
  // What the change reaches, against what is live on the target, with what the target told of itself.
  impact?: Impact
  // How a gradual release stands: the two versions, the share of the new one, its step, and why it was taken back.
  release?: {
    from: string
    to: string
    share: number
    step: number
    steps: number[]
    state: 'going' | 'back' | 'done'
    why?: string
  }
}

/** What `publish` takes. */
export interface PublishOptions {
  project: string
  history: History
  point?: string
  to: Target
  fetch: GuardedFetch
  try?: boolean
  // The impact was read: a publish whose impact holds wider rights or breaks for callers outside lands only so.
  acceptImpact?: boolean
  // The version is given to a share of the callers first, widened step by step or taken back by its watch.
  gradual?: boolean
  // A release that goes is asked how it stands, widened, or taken back.
  release?: 'status' | 'widen' | 'back'
  back?: boolean
  stopRuns?: boolean
  install?: boolean
  move?: boolean
  // A bundle of the point that was built elsewhere, as in the box of a workspace: it is sent as it is, and the point
  // is not built here, so that nothing of it is loaded by the program that publishes.
  bundle?: string
  // The branch that `now` follows is published as a preview of its own, beside what is live.
  preview?: boolean
}

/** The pointer that keeps the point that was last published to a target. */
const publishedAt = (address: string): string => `at:${new URL(address).origin.toLowerCase()}`

/** The branch that `now` follows, which a preview is named by. Throws T0002 where it follows none. */
function previewBranch(history: History): string {
  const branch = history.pointer('on')
  if (branch === undefined || branch === '')
    throw new TentError('T0002', 'A preview is of a branch, and the history follows none.', {
      fields: { preview: 'branch' },
      fix: 'Make a branch with `tent history branch <name>`, and publish its preview from there.',
    })
  return branch
}

/** Every file of a folder, by its path with `/`, with its bytes. */
function filesIn(folder: string): [string, Uint8Array][] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry): [string, Uint8Array] => {
      const lies = join(entry.parentPath, entry.name)
      return [
        lies
          .slice(folder.length + 1)
          .split(/[\\/]/)
          .join('/'),
        readFileSync(lies),
      ]
    })
    .sort(([a], [b]) => (a < b ? -1 : 1))
}

/** The description that is live on a target, fetched as a blob, or nothing where the target tells none. */
async function liveDescription(o: PublishOptions, print: string | undefined): Promise<Description | undefined> {
  if (print === undefined) return undefined
  try {
    const bytes = await asked({ to: o.to, fetch: o.fetch }, '/_t/sync/blobs', { want: [print] })
    const [found] = bytes instanceof Uint8Array ? blobsOf(bytes) : []
    return found ? JSON.parse(new TextDecoder().decode(found[1])) : undefined
  } catch {
    // A key that may not fetch the live description publishes all the same: what breaks is then not told.
    return undefined
  }
}

/** A bundle that was built elsewhere, read as data: its description, its folder and its version id. Throws T9101 for a folder that holds none. */
function bundleAt(folder: string): {
  description: Description
  bundleFolder: string
  versionId: string
  findings: Finding[]
} {
  const file = join(folder, 'description.json')
  if (!existsSync(file))
    throw new TentError('T9101', `The folder ${folder} holds no bundle, and nothing is published.`, {
      fields: { reason: 'bundle' },
      fix: 'Hand publish the folder of a bundle that a build wrote.',
    })
  const description: Description = JSON.parse(readFileSync(file, 'utf8'))
  return { description, bundleFolder: folder, versionId: write(description).versionId, findings: [] }
}

/** What carries npm out in a folder, as the build gives it. */
type Npm = (folder: string, words: string[]) => { status: number; said: string }

/** The folder a point is built in, under the engine's own folder of the project, with what it needs to build. */
function folderOf(o: PublishOptions, point: Point, npm: Npm): string {
  const folder = join(o.project, '.tent', 'publish', point.id)
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  mkdirSync(folder, { recursive: true })
  o.history.write(point.id, folder)
  const lock = 'package-lock.json'
  const ours = existsSync(join(o.project, lock)) ? fingerprintOf(readFileSync(join(o.project, lock))) : undefined
  if (point.files?.[lock] !== ours && o.install !== true)
    throw new TentError('T9101', `The point ${point.id} holds another lock file than the project, and is not built.`, {
      fields: { point: point.id, reason: 'lock' },
      fix: 'Publish it with `--install`, which installs the lock file of the point into the folder it is built in.',
    })
  if (point.files?.[lock] !== ours) {
    // The runtime's own npm installs the packages of the point's lock file, with the install scripts off.
    const installed = npm(folder, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    if (installed.status !== 0)
      throw new TentError(
        'T0016',
        `npm could not install the packages of the point:
${installed.said}`,
        {
          fix: 'Publish again once this computer reaches the registry of the packages.',
        },
      )
  } else if (existsSync(join(o.project, 'node_modules')))
    symlinkSync(join(o.project, 'node_modules'), join(folder, 'node_modules'), 'junction')
  return folder
}

/**
 * Publishes a point of a project to a target, steps 1 to 9 of publishing: the point is built for release in a
 * folder of its own and checked, whatever it says of itself; a point of the kind `published` is made whose
 * parents are that point and the one that is live there; what the target lacks is sent; the target is asked what
 * the publish would do, and with `try` that is answered; and the target checks, adds, asks its health query and
 * switches. With `back` the target goes back to the version before. With `preview` the target runs the point
 * as an app of its own under the name of the branch that `now` follows, and what is live there is not touched.
 * Answers what the target answered, with what would break a caller. Throws T9101 for a point that is unsettled or
 * does not pass, T0002 for a preview with no branch, and what the target refused the publish with: T9103, T9104,
 * T9107.
 */
export async function publish(o: PublishOptions): Promise<Published> {
  const reaching = { to: o.to, fetch: o.fetch }
  const by: Writer = { kind: 'person' }
  const flags = { ...(o.stopRuns ? { stopRuns: true } : {}), ...(o.move ? { move: true } : {}) }
  // A release that goes is asked how it stands, widened or taken back: nothing is built or sent.
  if (o.release) {
    const answer: Published = Object(await asked(reaching, '/_t/publish', { release: o.release }))
    return { ...answer, breaks: [] }
  }
  if (o.back) {
    const answer: Published = Object(
      await asked(reaching, '/_t/publish', { back: true, ...flags, ...(o.try ? { try: true } : {}) }),
    )
    if (!o.try && o.history.read(answer.point)) o.history.move(publishedAt(o.to.address), answer.point)
    return { ...answer, breaks: [], impact: noImpact('live') }
  }
  const picked = o.point === undefined ? o.history.record(o.project, { by, kind: 'command' }) : o.history.find(o.point)
  if (!picked)
    throw new TentError('T9107', `The history holds no point that \`${o.point}\` names.`, {
      fields: { point: String(o.point) },
    })
  if (picked.unsettled)
    throw new TentError(
      'T9101',
      `The point ${picked.id} is a merge with clashes that are not settled, and is not published.`,
      {
        fields: { point: picked.id, reason: 'unsettled' },
        fix: 'Settle its clashes with `tent history merge --settle` first.',
      },
    )
  // The build, which holds the npm of the runtime, is loaded where a point is built: `tent start` loads none of it.
  const folder = o.bundle === undefined ? folderOf(o, picked, (await import('../build/index.ts')).npm) : undefined
  const built =
    folder === undefined
      ? bundleAt(o.bundle ?? '')
      : // The build tools are loaded where a publish builds: the server's half of this part runs without them.
        await (await import('./built.ts')).checkedBuild(folder, picked)
  const bundle = filesIn(built.bundleFolder)
  const files = Object.fromEntries(bundle.map(([path, bytes]) => [path, fingerprintOf(bytes)]))
  const told = Object(await asked(reaching, '/_t/sync/have', { points: [], blobs: [], pointers: true }))
  const live: { point?: string } = Object(told.live)
  const described = write(built.description).bytes
  const description = fingerprintOf(described)
  o.history.take({ blobs: { [description]: described } })
  // A preview comes from the branch alone: what is live on the target is no parent of it.
  const preview = o.preview === true ? previewBranch(o.history) : undefined
  const held: Omit<Point, 'id'> = {
    parents: [picked.id, ...(typeof live.point === 'string' && preview === undefined ? [live.point] : [])],
    at: Date.now(),
    by: { kind: by.kind, ...(by.id === undefined ? {} : { id: by.id }) },
    kind: 'published',
    name: built.versionId,
    files: picked.files ?? {},
  }
  const point: Point = { id: idOf(held), ...held, description }
  const points = await lackingThere(reaching, o.history, picked.id)
  await sendPoints(reaching, o.history, [...points, point])
  await sendBundle(reaching, bundle, files)
  const body = { point: point.id, version: built.versionId, files, ...flags, ...(o.gradual ? { gradual: true } : {}) }
  if (preview !== undefined) {
    const answer: Published = Object(await asked(reaching, '/_t/publish', { ...body, preview }))
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    return { ...answer, breaks: [], findings: [...built.findings, ...(answer.findings ?? [])] }
  }
  // What the target told of itself beside what it answers, which the impact is worked out with.
  const looked: Published & { facts?: ImpactFacts } = Object(
    await asked(reaching, '/_t/publish', { ...body, try: true }),
  )
  const before = await liveDescription(o, looked.live)
  const breaking = before ? breaks(before, built.description) : []
  // A target with nothing live yet is the first publish: nothing it changes is held against anything.
  const impact = before
    ? impactOf({
        against: 'live',
        live: before,
        next: built.description,
        ...(looked.facts ? { facts: looked.facts } : {}),
      })
    : noImpact('live')
  // What the target told of itself is worked into the impact, the one report of the publish, and is no part of it.
  const { facts: _, ...lookedAt } = looked
  // The findings of the check are said as findings, at try as at landing: the runs that wait on older versions,
  // which the target tells, are the work under way of the impact.
  if (o.try)
    return {
      ...lookedAt,
      findings: [...built.findings, ...(lookedAt.findings ?? [])],
      breaks: breaking,
      impact: reportOf(impact, { ...lookedAt, findings: lookedAt.findings ?? [] }),
    }
  // Wider rights and breaks for callers outside land only where the impact was read: a script cannot land them unread.
  if ((impact.rights.length || impact.breaks.length) && o.acceptImpact !== true)
    throw new TentError(
      'T9103',
      `The publish widens ${impact.rights.length} rights and breaks ${impact.breaks.length} for callers outside, and its impact was not accepted.`,
      {
        fields: { reason: 'impact', count: String(impact.rights.length + impact.breaks.length) },
        fix: 'Read the impact that `tent publish` prints, and publish with `--yes --accept-impact`.',
      },
    )
  const answer: Published & { facts?: ImpactFacts } = Object(await asked(reaching, '/_t/publish', body))
  if (point.parents.every((one) => o.history.read(one))) o.history.take({ points: [point] })
  if (o.history.read(point.id)) keepImpact(o.history, point.id, impact)
  o.history.move(publishedAt(o.to.address), o.history.read(point.id) ? point.id : picked.id)
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  const findings = [...built.findings, ...(answer.findings ?? [])]
  const { facts: __, ...landed } = answer
  return {
    ...landed,
    breaks: breaking,
    impact: reportOf(impact, { ...landed, findings: answer.findings ?? [] }),
    findings,
  }
}
