import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { GuardedFetch } from '../connect/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { write } from '../core/internal.ts'
import type { App, Engine, OpenOptions } from '../engine/index.ts'
import { secretsNamed } from '../engine/index.ts'
import { blobsFetched } from './blobsFetched.ts'
import { notAsNamed } from './serve/named.ts'
import { healthAfter, healthy } from './serve/publishing.ts'
import { isBundlePath } from './serve/versions.ts'
import type { Target } from './target.ts'
import { asked } from './target.ts'

/** A server that follows another: the app it runs, and what stops it. */
export interface Follower {
  app(): App | undefined
  // Asks the server it follows at once, as the timer does, and answers when that is done.
  now(): Promise<void>
  close(): void
}

/** What a server that follows is handed. */
export interface FollowOptions {
  engine: Engine
  from: Target
  fetch: GuardedFetch
  dataFolder: string
  every?: number
  stopRuns?: boolean
  open?: Omit<OpenOptions, 'dataFolder'>
  // Told what the follower did or did not take, as a line of its log.
  told?: (line: string) => void
}

/** What a server tells of what is live there: its version, and the files of its bundle by path. */
interface Live {
  version: string
  files: Record<string, string>
}

/** Fetches the files of what is live into a folder of their own. Throws T9107 for a path that climbs out of it. */
async function fetchedBundle(o: FollowOptions, live: Live): Promise<string> {
  const folder = mkdtempSync(join(tmpdir(), 'tent-follow-'))
  const reaching = { to: o.from, fetch: o.fetch }
  const got = await blobsFetched(reaching, Object.values(live.files))
  for (const [path, print] of Object.entries(live.files)) {
    if (!isBundlePath(path))
      throw new TentError(
        'T9107',
        `The server that is followed names a file \`${path}\` that climbs out of a bundle.`,
        { fields: { path } },
      )
    const bytes = got.get(print)
    if (!bytes)
      throw new TentError('T9107', `The server that is followed did not send ${path}.`, { fields: { blob: print } })
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
  return folder
}

/**
 * Reads the description of a bundle that was fetched and holds it to the version it was named as, as a publish
 * does: the description must give that version id, and every module and asset the fingerprint its name gives.
 * Answers the description. Throws T9107 where it does not.
 */
function heldAs(folder: string, version: string): Description {
  const description: Description = JSON.parse(readFileSync(join(folder, 'description.json'), 'utf8'))
  const other =
    write(description).versionId !== version ? 'its description gives another id' : notAsNamed(folder, description)
  if (other)
    throw new TentError('T9107', `The files of the version ${version} give another version: ${other}.`, {
      fields: { version },
    })
  return description
}

/**
 * Runs an app that takes each new version of another server by itself: every `every` milliseconds, one minute
 * where none is given, it asks what is live there, fetches what is new, and adds and switches to it as a publish
 * does. With nothing running yet it first opens what is live there. A version that is a hard switch while a run
 * waits is not taken, and the log says so, unless it was started with `stopRuns`. When the server went back, it
 * goes back too. Answers once what is live there runs here.
 */
export async function followServer(o: FollowOptions): Promise<Follower> {
  let app: App | undefined
  let closed = false
  let busy: Promise<void> | undefined
  const told = o.told ?? (() => undefined)
  // The description of the live version where it was fetched and not taken: each turn holds it to every check.
  const waiting = new Map<string, Description>()
  const once = async (): Promise<void> => {
    const answer = Object(
      await asked({ to: o.from, fetch: o.fetch }, '/_t/sync/have', { points: [], blobs: [], pointers: true }),
    )
    const live: Live | undefined = typeof answer.live?.version === 'string' ? answer.live : undefined
    if (!live || closed) return
    const running = app?.versions().find((one) => one.running)?.id
    if (running === live.version) return
    const known = app?.versions().some((one) => one.id === live.version)
    for (const id of waiting.keys()) if (id !== live.version) waiting.delete(id)
    const held = known ? waiting.get(live.version) : undefined
    const folder = held ? undefined : await fetchedBundle(o, live)
    try {
      const description = held ?? (folder ? heldAs(folder, live.version) : undefined)
      if (!app) {
        app = await o.engine.open(String(folder), {
          ...o.open,
          dataFolder: o.dataFolder,
          mode: answer.mode === 'test' ? 'test' : 'live',
        })
        return
      }
      if (folder && !known) await app.add(folder)
      if (description) waiting.set(live.version, description)
      // A version that was added before the running one is the server going back.
      const order = app.versions().map((one) => one.id)
      const back = running !== undefined && order.indexOf(live.version) < order.indexOf(running)
      // The rows are held against the tables of the version before the switch, as a publish holds them.
      const facts = description ? await app.facts(description, back ? { back: true } : {}) : undefined
      const misfits = (facts?.tableFindings ?? []).filter((one) => one.level === 'error')
      if (misfits.length) {
        told(
          `The version ${live.version} does not fit the rows here, and was not taken: ${misfits.map((one) => one.message).join(' ')}`,
        )
        return
      }
      const looked = await app.switch(live.version, {
        dry: true,
        hard: o.stopRuns ? 'stop' : 'refuse',
        ...(back ? { back: true } : {}),
      })
      if (looked.refused === 'runs') {
        told(
          `The version ${live.version} is a hard switch while runs wait, and was not taken: start with --stop-runs to take it.`,
        )
        return
      }
      // A secret that the version names and that has no value here keeps it from running, as a publish does.
      const set: unknown = Reflect.get(Object(await app.values({ kind: 'secret', list: true })), 'set')
      const missing = description
        ? secretsNamed(description).filter((name) => !(Array.isArray(set) && set.includes(name)))
        : []
      if (missing.length) {
        told(
          `The version ${live.version} names secrets that have no value here, and was not taken: ${missing.join(', ')}.`,
        )
        return
      }
      // Its health query is asked as a publish asks it: before the switch, unless the switch changes a table that
      // it reads, and then after it, where a version that fails it is gone back from at once.
      const after = description !== undefined && healthAfter(app.description, description, looked.steps)
      if (description && running !== undefined && !after) await healthy(app, description, live.version)
      // A backup of the data is taken before the switch, as before every publish.
      await app.switch(live.version, {
        hard: o.stopRuns ? 'stop' : 'refuse',
        backup: true,
        ...(back ? { back: true } : {}),
      })
      if (description && running !== undefined && after)
        try {
          await healthy(app, description, live.version)
        } catch (error) {
          await app.switch(running, { back: true }).catch(() => undefined)
          throw error
        }
      waiting.delete(live.version)
      told(`The version ${live.version} of ${o.from.address} runs.`)
    } finally {
      if (folder) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    }
  }
  const turn = (): Promise<void> => {
    busy ??= once()
      .catch((error: unknown) =>
        told(`Following ${o.from.address} failed: ${error instanceof Error ? error.message : String(error)}`),
      )
      .finally(() => {
        busy = undefined
      })
    return busy
  }
  await once()
  const timer = setInterval(() => void turn(), o.every ?? 60_000)
  // The program that runs it is held open by its engine: the timer keeps nothing running by itself.
  timer.unref()
  return {
    app: () => app,
    now: turn,
    close() {
      closed = true
      clearInterval(timer)
    },
  }
}
