import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { App, ServedRequest } from '../../engine/index.ts'
import { secretsNamed } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { syncLimit } from '../limits.ts'
import { refusedPush } from './merged.ts'
import type { Previews } from './previews.ts'
import { previewed } from './previews.ts'
import { namesKeyTwice } from './once.ts'
import { waitingFindings } from './waiting.ts'
import type { ImpactFacts } from '../impact/face.ts'
import { askerOfApp, factsOf } from '../impact/facts.ts'
import { addedFrom, bundlePoint, bundleTaken, keepBundle, notHeld } from './versions.ts'

/** What a server holds for its publishes: the app, its history, and whether a publish is under way. */
export interface PublishServer {
  app: App
  history: History
  busy: boolean
  // What stops the time of each older version that stays loadable after a switch, by its id.
  kept: Map<string, () => void>
  // The previews of branches, on a server that keeps them.
  previews?: Previews
}

/** What a publish answers, as `Published` of `tentjs/publish`, the target's part of it. */
interface Answered {
  version: string
  point: string
  hard: boolean
  opens: boolean
  breaks: []
  findings: object[]
  refused?: string
  live?: string
  behind?: number
  old?: object[]
  // What this server alone knows of the change, which the impact that the publishing computer prints names.
  facts?: ImpactFacts
  // How a gradual release stands.
  release?: Switched['release']
}

type Switched = Awaited<ReturnType<App['switch']>>

// What a release that goes is moved by, or asked how it stands by.
const moves = ['status', 'widen', 'back'] as const

const system = { kind: 'system' } as const

/** The running version of an app. */
const runningOf = (app: App): string | undefined => app.versions().find((one) => one.running)?.id

/** The version that a published point names. */
const versionOf = (history: History, point: string | undefined): string | undefined =>
  point === undefined ? undefined : history.read(point)?.name

/**
 * Takes the description that runs, the one a switch goes to, and the table steps of the switch. Answers whether
 * the health query of the new version reads a table that the switch changes, by the `reads` its record keeps: it
 * is then asked after the switch, and before it otherwise. A table is changed by a step of the shared file, or,
 * of a tenant table, by what its definition says: the files of tenants are brought up after the switch, and the steps of
 * the shared file do not name them.
 */
export function healthAfter(running: Description, next: Description, steps: object[]): boolean {
  const changed = new Set(steps.map((step) => String(Reflect.get(step, 'table') ?? '')))
  for (const [name, table] of Object.entries(next.tables))
    if (JSON.stringify(table) !== JSON.stringify(running.tables[name] ?? null)) changed.add(name)
  const health: unknown = Reflect.get(Object(Object(next.project).publish), 'health')
  const reads: unknown = typeof health === 'string' ? next.functions[health]?.reads : undefined
  return (Array.isArray(reads) ? reads.map(String) : []).some((table) => changed.has(table))
}

/**
 * Asks the health query of the project of a version, where it names one, as the system, of that version, within
 * the time it states. Throws T9103 with `health` where it fails or is late.
 */
export async function healthy(app: App, description: Description, version: string): Promise<void> {
  const asked: Record<string, unknown> = Object(Object(description.project).publish)
  if (typeof asked.health !== 'string') return
  const within = typeof asked.within === 'number' ? asked.within : 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      app.call(asked.health, {}, { as: system, version }),
      new Promise((_, refuse) => {
        timer = setTimeout(() => refuse(new Error(`it did not answer within ${within} ms`)), within)
      }),
    ])
  } catch (error) {
    throw refusedPush(
      `The version ${version} failed its health check: ${asked.health} ${error instanceof Error ? error.message : String(error)}.`,
      { reason: 'health' },
      'Mend the health query or what it reads, and publish again.',
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Keeps a version that a switch left loadable for `versionKept`, and then drops it where nothing needs it. */
function keptFor(server: PublishServer, version: string, ms: number): void {
  server.kept.get(version)?.()
  const timer = setTimeout(() => {
    server.kept.delete(version)
    const one = server.app.versions().find((it) => it.id === version)
    if (one && !one.running && !one.needed) void server.app.drop(version).catch(() => undefined)
  }, ms)
  timer.unref()
  server.kept.set(version, () => clearTimeout(timer))
}

/** The tables that gain or lose `tenant` from one description to another: the rows of each are moved by a publish with `move`. */
const movingTables = (from: Description, to: Description): string[] =>
  Object.keys(to.tables).filter(
    (name) =>
      Object.hasOwn(from.tables, name) &&
      (from.tables[name].tenant === undefined) !== (to.tables[name].tenant === undefined),
  )

/** Why a switch was refused, as the reason of T9103. */
function refusalOf(error: unknown): TentError {
  const code = error instanceof TentError ? error.code : 'T0009'
  const reason = /^T200[1-4]$/.test(code) || code === 'T2107' ? 'rows' : 'switch'
  return refusedPush(
    `The version cannot be switched to: ${error instanceof Error ? error.message : String(error)}`,
    { reason, code },
    'Change the rows that do not fit, or the version, and publish again.',
  )
}

/**
 * Carries a publish out on the target, steps 5 to 9: the bundle that the point names is held against the version
 * id, the data against the new tables, and the secrets it names against those that have a value; it is added
 * beside the running one, its health query asked, and switched to; `live` moves to the point. With `try` it
 * answers what it would do, with nothing changed. Throws T9103 with what refused it, and T9107 for what was not sent.
 */
async function published(server: PublishServer, body: Record<string, unknown>): Promise<Answered> {
  const { app, history } = server
  const stopRuns = body.stopRuns === true
  const tried = body.try === true
  const live = history.pointer('live')
  // A release that goes is asked how it stands, widened or taken back by hand.
  const running = runningOf(app) ?? ''
  const going = (await app.switch(running, { gradual: 'status' })).release?.state === 'going'
  // Going back while a release goes takes the release back.
  const move = moves.find((one) => one === body.release) ?? (body.back === true && going ? 'back' : undefined)
  if (move) {
    const { release } = await app.switch(running, { gradual: move })
    return {
      version: release?.to ?? running,
      point: live ?? '',
      hard: false,
      opens: false,
      breaks: [],
      findings: [],
      ...(release ? { release } : {}),
    }
  }
  let point: string
  let version: string
  // The point of the files of the version: published already, or kept now and taken as that version once published.
  let bundle: string | undefined
  if (body.back === true) {
    const second = live === undefined ? undefined : history.read(live)?.parents[1]
    const back = versionOf(history, second)
    if (second === undefined || back === undefined)
      throw refusedPush(
        'There is nothing to go back to: the live point has no point before it.',
        { reason: 'nothing' },
        'Publish a point.',
      )
    ;[point, version] = [second, back]
    bundle = bundlePoint(history, version)
  } else {
    const files: Record<string, unknown> = Object(body.files)
    if (typeof body.point !== 'string' || typeof body.version !== 'string')
      throw new TentError('T0002', 'A publish names `point`, `version` and `files`.', { fields: { point: 'required' } })
    const named = history.read(body.point)
    if (named?.kind !== 'published' || named.name !== body.version)
      throw notHeld(`The server holds no point of the publish of the version ${body.version}.`, { point: body.point })
    if (Object.values(files).some((one) => typeof one !== 'string'))
      throw new TentError('T0002', '`files` names each file of the bundle by its fingerprint.', {
        fields: { files: 'type' },
      })
    bundle = keepBundle(history, body.version, Object(files))
    ;[point, version] = [body.point, body.version]
  }
  const was = runningOf(app)
  const how = { ...(body.back === true ? { back: true } : {}), ...(body.move === true ? { move: true } : {}) }
  const description = await addedFrom(app, version, { history, ...(bundle ? { at: bundle } : {}) })
  const drop = async (): Promise<void> => {
    if (version !== was) await app.drop(version).catch(() => false)
  }
  try {
    const facts = await app.facts(description, body.back === true ? { back: true } : {})
    // With `move` a table that gains or loses `tenant` is the move's to hold: its rows are counted by the dry switch.
    const moving = body.move === true ? movingTables(app.description, description) : []
    const rows = facts.tableFindings.filter(
      (one) => one.level === 'error' && !moving.some((table) => one.message.startsWith(`The table \`${table}\` `)),
    )
    const set = Object(await app.values({ kind: 'secret', list: true })).set
    const missing = secretsNamed(description).filter((name) => !(Array.isArray(set) && set.includes(name)))
    const findings = waitingFindings(description, facts.waitingStepNames)
    let looked: Awaited<ReturnType<App['switch']>> = { hard: false, opens: false, steps: [] }
    try {
      looked = await app.switch(version, { dry: true, hard: stopRuns ? 'stop' : 'refuse', ...how })
    } catch (error) {
      // A table step that the rows do not fit is refused by the switch too, with the finding of the check.
      if (!rows.length) throw refusalOf(error)
    }
    const refused =
      rows.length > 0
        ? `rows: ${rows.map((one) => one.message).join(' ')}`
        : missing.length
          ? `secret: ${missing.length} ${missing.length === 1 ? 'secret has' : 'secrets have'} no value here: ${missing.join(', ')}`
          : looked.refused === 'runs'
            ? `waiting: a hard publish while ${looked.runs?.length ?? 0} runs of an older version wait`
            : looked.refused === 'behind'
              ? `behind: ${looked.behind ?? 0} files of tenants are behind the running layout`
              : undefined
    // What is live is told by the fingerprint of its description, which the publishing computer fetches as a blob.
    const liveDescription = live === undefined ? undefined : history.read(live)?.description
    const answer: Answered = {
      version,
      point,
      hard: looked.hard,
      opens: looked.opens,
      breaks: [],
      findings,
      ...(looked.behind === undefined ? {} : { behind: looked.behind }),
      ...(looked.old?.length ? { old: looked.old } : {}),
      ...(liveDescription ? { live: liveDescription } : {}),
    }
    if (tried) {
      // The callers, the rows and the runs of what the change touches are this server's to tell.
      // What cannot be told makes the impact the poorer and refuses nothing.
      const facts = await factsOf(askerOfApp(app), app.description, description).catch(() => undefined)
      await drop()
      return { ...answer, ...(facts ? { facts } : {}), ...(refused ? { refused } : {}) }
    }
    if (refused) {
      const [reason, words] = [refused.split(':')[0], refused.slice(refused.indexOf(':') + 2)]
      const count =
        reason === 'rows'
          ? rows.length
          : reason === 'secret'
            ? missing.length
            : (looked.runs?.length ?? looked.behind ?? 0)
      throw refusedPush(
        `The publish was refused: ${words}`,
        { reason, count: String(count) },
        'Mend what is named, and publish again.',
      )
    }
    // Where the publish changes a table that the health query reads, the query is asked after the switch instead.
    const touched = healthAfter(app.description, description, looked.steps)
    if (!touched) await healthy(app, description, version)
    // A gradual release gives the version to a share of the callers first: `live` moves once it is every caller's,
    // and a release taken back says why in the note of its point.
    if (body.gradual === true || Reflect.get(Object(description.project.release), 'gradual') === true) {
      // A backup of the data is taken before every publish, also one that changes no table.
      const { release } = await app.switch(version, {
        backup: true,
        gradual: {
          told: (ended) => {
            if (ended.state === 'done') history.move('live', point)
            else history.mark(point, { note: `taken back: ${ended.why ?? ''}` })
          },
        },
      })
      if (bundle) bundleTaken(history, version, bundle)
      return { ...answer, ...(release ? { release } : {}) }
    }
    let switched: Awaited<ReturnType<App['switch']>>
    try {
      switched = await app.switch(version, { hard: stopRuns ? 'stop' : 'refuse', backup: true, ...how })
    } catch (error) {
      throw refusalOf(error)
    }
    if (touched) {
      try {
        await healthy(app, description, version)
      } catch (error) {
        if (was) await app.switch(was, { back: true }).catch(() => undefined)
        throw error
      }
    }
    history.move('live', point)
    if (bundle) bundleTaken(history, version, bundle)
    if (was && was !== version) keptFor(server, was, syncLimit(description, 'versionKept'))
    return { ...answer, hard: switched.hard, opens: switched.opens }
  } catch (error) {
    if (runningOf(app) !== version) await drop()
    throw error
  }
}

/** A publish of the preview of a branch, on a server that keeps previews. Throws T9103 on one that keeps none. */
function preview(server: PublishServer, body: Record<string, unknown>, request: Request): ReturnType<typeof previewed> {
  if (!server.previews)
    throw refusedPush('This server keeps no previews.', { reason: 'preview' }, 'Start the server with `tent start`.')
  return previewed(server.previews, body, new URL(request.url))
}

/** Answers `/_t/publish`: one publish at a time for an app, a second at once is T9103. */
export async function publishAnswer(server: PublishServer, asked: ServedRequest): Promise<Response> {
  if (!asked.key.rights.includes('publish'))
    throw new TentError('T9104', 'Publishing needs a key with the right `publish`.', { fields: { right: 'publish' } })
  if (server.busy)
    throw refusedPush(
      'Another publish of this app is under way.',
      { reason: 'busy' },
      'Publish again once it has ended.',
    )
  server.busy = true
  try {
    let body: unknown
    const text = await asked.request.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    // A record that names one key twice, a path of the files among them, is read as no record at all.
    if (namesKeyTwice(text))
      throw new TentError('T0002', 'The body names one key twice in one record.', { fields: { body: 'twice' } })
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new TentError('T0002', 'The body is a record in the wire form.', { fields: { body: 'type' } })
    const given = Object(body)
    const value =
      given.preview === undefined ? await published(server, given) : await preview(server, given, asked.request)
    return new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } })
  } finally {
    server.busy = false
  }
}
