import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { TentError } from '../core/index.ts'
import type { App, OpenOptions, Sandbox } from '../engine/index.ts'
import { sandboxOf } from '../engine/index.ts'
import type { Point, Writer } from '../history/index.ts'
import type { BoxBuilt, HeldBox } from './boxes.ts'
import { heldBox } from './boxes.ts'
import { buildWorkspace, filesPrint, joinedFindings } from './built.ts'
import { mailbox } from './mailbox.ts'
import type { Held, One } from './state.ts'
import { historyOf, hostOf, oneOf } from './state.ts'

// How long a workspace may stand unused before it falls asleep, where the workspaces state no other time.
const asleepAfter = '10 minutes'

/** The errors among findings. */
const errorsOf = (findings: Finding[]): Finding[] => findings.filter((one) => one.level === 'error')

/** The error of a build that wrote no bundle: the first error it found, with how many there were. */
function unbuilt(id: string, findings: Finding[]): TentError {
  const [first] = errorsOf(findings)
  return new TentError(
    first?.code ?? 'T0011',
    `The workspace ${id} does not build: ${first?.message ?? 'no bundle was written'}`,
    {
      fields: { count: String(errorsOf(findings).length) },
      fix: 'Mend what the build found, as `rebuild` answers it, and run the workspace again.',
    },
  )
}

/** The error of code that is neither trusted nor built in a box and run in a room: it is neither built nor run. */
const notRun = (id: string): TentError =>
  new TentError(
    'T9105',
    `The workspace ${id} is code, and neither a role that \`trusted\` names nor a \`sandbox\` with a \`room\` lets it run.`,
    {
      fields: { rule: 'code' },
      fix: 'Give the workspaces a `sandbox` to build in and a `room` to run in, or a role of the owner in `trusted`.',
    },
  )

/** Whether the owner of a workspace holds a role that `trusted` names, by their row in the product's own `users`. */
export async function trustedOwner(held: Held, one: One): Promise<boolean> {
  const trusted = held.o.trusted ?? []
  if (!trusted.length) return false
  const row: unknown = await held.o.app
    .read({ from: 'users', one: 'get', id: one.workspace.owner }, { as: 'system' })
    .catch(() => undefined)
  const roles: unknown = Reflect.get(Object(row), 'roles')
  return Array.isArray(roles) && roles.some((role) => trusted.includes(String(role)))
}

/** The closed room of the workspaces: the one they were made with, or the one the makers of the product's app made. */
const sandboxFor = (held: Held): Sandbox | undefined => held.o.sandbox ?? sandboxOf(held.o.app)

/**
 * What the engine is handed to open the test side of a workspace with, beside its bundle: for code built in a box,
 * the room of the workspaces, which its code runs in.
 */
function openOf(held: Held, one: One, boxed: boolean): OpenOptions {
  const { o } = held
  const room = boxed ? o.room : undefined
  const mailer = o.mail === true ? undefined : () => mailbox(one.folders.data)
  return {
    dataFolder: one.folders.data,
    address: [hostOf(one.workspace.address)],
    mode: 'test',
    lazy: true,
    sleepAfter: o.sleepAfter ?? asleepAfter,
    ...(o.framedBy ? { framedBy: o.framedBy } : {}),
    ...(o.identify ? { identify: o.identify } : {}),
    // The test side writes its mail down in place of sending it, unless the product wants it sent.
    ...(mailer || room ? { makers: { ...(mailer ? { mailer } : {}), ...(room ? { room } : {}) } } : {}),
    ...(o.counting ?? {}),
  }
}

/** The file in which the engine's folder of a workspace keeps the print of the files that its last build was made of. */
const builtFile = (one: One): string => join(one.folders.data, 'built.json')

/** What the last build of a workspace kept: the print of its files, its version and its bundle, or nothing. */
function lastBuilt(one: One): { print: string; version: string; bundle: string; boxed: boolean } | undefined {
  if (!existsSync(builtFile(one))) return undefined
  try {
    const read: unknown = JSON.parse(readFileSync(builtFile(one), 'utf8'))
    const [print, version, bundle] = ['print', 'version', 'bundle'].map((key) => Reflect.get(Object(read), key))
    if (typeof print !== 'string' || typeof version !== 'string' || typeof bundle !== 'string') return undefined
    return { print, version, bundle, boxed: Reflect.get(Object(read), 'boxed') === true }
  } catch {
    return undefined
  }
}

/** The box of a workspace that holds code, made at its first use. */
function boxOf(one: One, sandbox: Sandbox): HeldBox {
  one.box ??= heldBox({ id: one.workspace.id, owner: one.workspace.owner, folders: one.folders, sandbox })
  return one.box
}

/**
 * Builds a workspace: in the engine's program where its owner is trusted, and in its box otherwise, where the
 * workspaces hold a room to run what it built in. Answers what the build wrote and found, and whether it was built
 * in a box. Throws T9105 where nothing lets it be built and run.
 */
async function builtOf(
  held: Held,
  one: One,
): Promise<{ versionId: string; findings: Finding[]; bundle: string; boxed: boolean }> {
  if (await trustedOwner(held, one)) {
    const built = await buildWorkspace(one.folders.project, join(one.folders.data, 'build'), {})
    return { versionId: built.versionId, findings: built.findings, bundle: built.bundleFolder, boxed: false }
  }
  const sandbox = sandboxFor(held)
  if (!sandbox || !held.o.room) throw notRun(one.workspace.id)
  const built = await checkedInBox(held, one, 'dev')
  return { versionId: built.versionId, findings: built.findings, bundle: built.bundle, boxed: true }
}

/** The box of a workspace whose owner is not trusted, made at its first use. Throws T9105 where no sandbox lets one be made. */
export function boxedOf(held: Held, one: One): HeldBox {
  const sandbox = sandboxFor(held)
  if (!sandbox) throw notRun(one.workspace.id)
  return boxOf(one, sandbox)
}

/**
 * Takes what the workspaces hold, a workspace whose owner is not trusted, and what it is built for: its test side,
 * as a development build, or a release. Builds it in its box and checks it there, where nothing of it runs in the
 * program of the product. Answers what the build wrote, with what the build and the check found. Throws T9105 where
 * no sandbox lets a box be made.
 */
export async function checkedInBox(held: Held, one: One, kind: 'dev' | 'release'): Promise<BoxBuilt> {
  const box = boxedOf(held, one)
  const built = await box.build({ for: kind })
  return { ...built, findings: joinedFindings(built.findings, await box.check()) }
}

/**
 * Builds a workspace and makes what it built its running version in the product's own engine, opened the first
 * time and switched to afterwards: code built in a box runs there in the room of the workspaces. `ended` is called
 * once the build ended, before anything is switched. Answers the app, what the build found, and
 * its version. A build with an error leaves the running version as it was; where none runs yet it throws the first
 * error.
 */
async function builtAndRun(
  held: Held,
  one: One,
  print: string,
  ended?: () => void,
): Promise<{ app: App; findings: Finding[]; version: string }> {
  const built = await builtOf(held, one)
  ended?.()
  if (!built.versionId) {
    if (one.app) return { app: one.app, findings: built.findings, version: '' }
    throw unbuilt(one.workspace.id, built.findings)
  }
  if (one.app) {
    const version = await one.app.add(built.bundle)
    if (one.app.versions().find((v) => v.running)?.id !== version) await one.app.switch(version)
  } else one.app = await held.o.engine.open(built.bundle, openOf(held, one, built.boxed))
  one.print = print
  writeFileSync(
    builtFile(one),
    JSON.stringify({ print, version: built.versionId, bundle: built.bundle, boxed: built.boxed }),
  )
  return { app: one.app, findings: built.findings, version: built.versionId }
}

/**
 * Takes what the workspaces hold and the id of a workspace. Answers its app: the same one while it stays open
 * and its files did not change; built when they changed and made the running version. An app whose last build
 * kept the print of the files as they stand is opened on that build, with nothing built. With `asItRuns` nothing
 * is built where a version runs or was built: the app is answered as it runs, or opened on its last build, so that
 * what changed since can be held against it. Throws T0001 for no workspace, T9105 for code that nothing lets run,
 * and the first error of a build where no version runs yet.
 */
export function runWorkspace(held: Held, id: string, o: { asItRuns?: true } = {}): Promise<App> {
  const one = oneOf(held, id)
  one.opening ??= (async () => {
    // The history of a workspace lies beside its data.
    historyOf(one)
    const print = filesPrint(one.folders.project)
    if (one.app && (o.asItRuns || one.print === print)) return one.app
    const kept = lastBuilt(one)
    // A build is opened again as its owner stands now: code built in a box in a room alone, never in the program.
    const boxed = !(await trustedOwner(held, one))
    const opens = kept !== undefined && kept.boxed === boxed && (!boxed || held.o.room !== undefined)
    if (
      !one.app &&
      opens &&
      (o.asItRuns || kept.print === print) &&
      existsSync(join(kept.bundle, 'description.json'))
    ) {
      one.app = await held.o.engine.open(kept.bundle, openOf(held, one, kept.boxed))
      // The print of what it was built from: a later run builds what changed since.
      one.print = kept.print
      return one.app
    }
    return (await builtAndRun(held, one, print)).app
  })().finally(() => {
    one.opening = undefined
  })
  return one.opening
}

/**
 * Takes what the workspaces hold, the id of a workspace, and what is called once the build ended, before anything
 * is switched. Builds it and checks it, and makes what was built its running version where it
 * built. A workspace in a box is built and checked there: the program of the host runs nothing of it. Answers the
 * version, the findings, and the description of what runs.
 */
export async function checkedWorkspace(
  held: Held,
  id: string,
  ended?: () => void,
): Promise<{ version?: string; findings: Finding[]; description?: Description }> {
  const one = oneOf(held, id)
  await one.opening?.catch(() => undefined)
  const print = filesPrint(one.folders.project)
  const done = await builtAndRun(held, one, print, ended)
  const { findings } = done
  return done.version ? { version: done.version, findings, description: done.app.description } : { findings }
}

/**
 * Takes what the workspaces hold, the id of a workspace and who asks. Builds it and checks it, makes what was built
 * its running version where it passed, and records a point of the kind `command` by that writer, with the
 * description and whether it passed. Answers the version, the findings and the point.
 */
export async function rebuildWorkspace(
  held: Held,
  id: string,
  by: Writer,
): Promise<{ version?: string; findings: Finding[]; point: Point }> {
  const { description, ...done } = await checkedWorkspace(held, id)
  const point = historyOf(oneOf(held, id)).record(oneOf(held, id).folders.project, {
    by,
    kind: 'command',
    checked: errorsOf(done.findings).length === 0,
    ...(description ? { description } : {}),
  })
  return { ...done, point }
}
