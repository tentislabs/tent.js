import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { write, writeOwnerOnly } from '../../core/internal.ts'
import type { App, Engine } from '../../engine/index.ts'
import { newSecretKey } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { syncLimit } from '../limits.ts'
import { refusedPush } from './merged.ts'
import { notAsNamed } from './named.ts'
import { keepBundle, notHeld } from './versions.ts'
import { comesFrom } from './walk.ts'

/** What a server holds of its previews: the engine they run in, the app it serves, its history, and each preview. */
export interface Previews {
  engine: Engine
  target: App
  history: History
  dataFolder: string
  mode: string
  open: Map<string, App>
}

/** A preview as the server keeps it: its version, the point of the branch it shows, its name, and when it was made. */
interface Kept {
  version: string
  point: string
  host: string
  at: number
  // The key of the secrets the preview is opened with, which it reads from no file and from no variable.
  key: string
}

const isKept = (value: unknown): value is Kept =>
  typeof Reflect.get(Object(value), 'version') === 'string' &&
  typeof Reflect.get(Object(value), 'point') === 'string' &&
  typeof Reflect.get(Object(value), 'host') === 'string' &&
  typeof Reflect.get(Object(value), 'at') === 'number' &&
  typeof Reflect.get(Object(value), 'key') === 'string'

const folderOf = (p: Previews, branch?: string): string =>
  branch === undefined ? join(p.dataFolder, 'previews') : join(p.dataFolder, 'previews', branch)

const listFile = (p: Previews): string => join(folderOf(p), 'previews.json')

/** The previews the server keeps, by their branch. */
function listed(p: Previews): Record<string, Kept> {
  try {
    const read: unknown = JSON.parse(readFileSync(listFile(p), 'utf8'))
    return Object.fromEntries(Object.entries(Object(read)).filter((entry): entry is [string, Kept] => isKept(entry[1])))
  } catch {
    return {}
  }
}

function keepListed(p: Previews, list: Record<string, Kept>): void {
  mkdirSync(folderOf(p), { recursive: true })
  // The list holds the key of the secrets of each preview, so it is kept as the engine keeps every such key.
  writeOwnerOnly(listFile(p), `${JSON.stringify(list, null, 2)}\n`)
}

/** Whether a text names a branch as the first word of a name of the web: small letters, digits and hyphens. */
const isLabel = (name: string): boolean => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(name)

/** Takes a preview away: its app is closed, its folder removed, and it is listed no more. */
async function ended(p: Previews, branch: string): Promise<void> {
  const app = p.open.get(branch)
  p.open.delete(branch)
  if (app) await app.close().catch(() => undefined)
  rmSync(folderOf(p, branch), { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  const list = listed(p)
  if (Object.hasOwn(list, branch)) {
    delete list[branch]
    keepListed(p, list)
  }
}

/** Opens the app of a preview from its folder, in the mode `test`, under its own name, with its own key. */
const opened = (p: Previews, branch: string, host: string, key: string): Promise<App> =>
  p.engine.open(join(folderOf(p, branch), 'bundle'), {
    dataFolder: join(folderOf(p, branch), 'data'),
    mode: 'test',
    address: host,
    secretKey: key,
  })

/**
 * The key of the test data of a server in the mode `test`, which sealed its secrets and its rows: the one its
 * program is given, or the file of its folder.
 */
function testKey(p: Previews): string | undefined {
  const file = join(p.dataFolder, 'secret.key')
  const written = process.env.TENT_SECRET_KEY ?? (existsSync(file) ? readFileSync(file, 'utf8') : '')
  return written.trim() || undefined
}

/**
 * Takes the previews of a server, the body of a publish that names `preview`, and the name the server was asked
 * by. Runs the version as an app of its own, at `<branch>.<that name>`, in the mode `test`: on a copy of the
 * data of the server where it runs in the mode `test`, and on the seed alone where it runs another, so a
 * preview never holds live rows. A preview of a branch that had one replaces it. The app of the server is not
 * touched. Throws T0002 for a branch that cannot name one, T9107 for what was not sent, and T9103 where the
 * version does not open.
 */
export async function previewed(
  p: Previews,
  body: Record<string, unknown>,
  asked: URL,
): Promise<{ version: string; point: string; preview: string; hard: false; opens: false; breaks: []; findings: [] }> {
  const branch = body.preview
  if (typeof branch !== 'string' || !isLabel(branch))
    throw new TentError('T0002', 'A preview is of a branch whose name is small letters, digits and hyphens.', {
      fields: { preview: 'pattern' },
      fix: 'Name the branch so, as `rush` or `new-cart`, and publish its preview again.',
    })
  if (typeof body.point !== 'string' || typeof body.version !== 'string')
    throw new TentError('T0002', 'A publish names `point`, `version` and `files`.', { fields: { point: 'required' } })
  const named = p.history.read(body.point)
  if (named?.kind !== 'published' || named.name !== body.version)
    throw notHeld(`The server holds no point of the publish of the version ${body.version}.`, { point: body.point })
  const files: Record<string, unknown> = Object(body.files)
  if (Object.values(files).some((one) => typeof one !== 'string'))
    throw new TentError('T0002', '`files` names each file of the bundle by its fingerprint.', {
      fields: { files: 'type' },
    })
  const at = keepBundle(p.history, body.version, Object(files))
  await ended(p, branch)
  const folder = folderOf(p, branch)
  const bundle = join(folder, 'bundle')
  p.history.write(at, bundle)
  const description: Description = JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8'))
  const other = write(description).versionId !== body.version ? 'another id' : notAsNamed(bundle, description)
  if (other) {
    rmSync(folder, { recursive: true, force: true })
    throw notHeld(`The files that were named give another version than ${body.version}: ${other}.`, {
      version: body.version,
    })
  }
  const data = join(folder, 'data')
  mkdirSync(data, { recursive: true })
  // A preview has the secrets of the test app and its data, with the key that sealed them handed to it, and never
  // those of live: on a server of another mode it has none of the server's own, and a key of its own.
  const key = (p.mode === 'test' ? testKey(p) : undefined) ?? newSecretKey()
  if (p.mode === 'test') {
    const secrets = join(p.dataFolder, 'secrets.test')
    if (existsSync(secrets)) copyFileSync(secrets, join(data, 'secrets.test'))
    await p.target.snapshot(join(data, 'data.db'))
  }
  const host = `${branch}.${asked.host}`
  let app: App
  try {
    app = await opened(p, branch, host, key)
  } catch (error) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    throw refusedPush(
      `The preview of ${branch} does not open: ${error instanceof Error ? error.message : String(error)}`,
      { reason: 'preview', code: error instanceof TentError ? error.code : 'T0009' },
      'Mend what is named, and publish the preview again.',
    )
  }
  if (p.mode !== 'test') await app.seed()
  p.open.set(branch, app)
  keepListed(p, {
    ...listed(p),
    [branch]: { version: body.version, point: named.parents[0] ?? body.point, host, at: Date.now(), key },
  })
  return {
    version: body.version,
    point: body.point,
    preview: `${asked.protocol}//${host}`,
    hard: false,
    opens: false,
    breaks: [],
    findings: [],
  }
}

/** Takes away the preview of each branch that a pointer which moved now holds: that branch was merged there. */
export async function mergedPreviews(p: Previews, pointer: string, point: string): Promise<void> {
  for (const [branch, kept] of Object.entries(listed(p)))
    if (branch !== pointer && comesFrom(p.history, point, kept.point)) await ended(p, branch)
}

/** Takes away each preview older than `limits.previewKept`. */
export async function tidyPreviews(p: Previews, now: number): Promise<void> {
  const kept = syncLimit(p.target.description, 'previewKept')
  for (const [branch, one] of Object.entries(listed(p))) if (one.at + kept <= now) await ended(p, branch)
}

/** Opens again each preview that the server kept, as it opens its own app. A preview that does not open is taken away. */
export async function reopenPreviews(p: Previews): Promise<void> {
  for (const [branch, one] of Object.entries(listed(p)))
    try {
      p.open.set(branch, await opened(p, branch, one.host, one.key))
    } catch {
      await ended(p, branch)
    }
}
