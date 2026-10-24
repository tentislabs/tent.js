import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { finding } from '../core/internal.ts'
import type { Box, Sandbox } from '../engine/index.ts'
import { descriptionOf } from '../engine/index.ts'
import type { Folders } from './folder.ts'

/** What the box of one workspace is made with. */
export interface BoxOptions {
  id: string
  owner: string
  folders: Folders
  sandbox: Sandbox
}

/** What one build in the box wrote: its version, what it found, its description, and the bundle as the host reads it. */
export interface BoxBuilt {
  versionId: string
  findings: Finding[]
  description: Description
  bundle: string
}

/** The box of one workspace, as the workspaces hold it: it builds and checks, and serves nothing. */
export interface HeldBox {
  // Builds the project in the box into a folder of its own in the box's work: for its test side, or a release.
  build(o: { for: 'dev' | 'release' }): Promise<BoxBuilt>
  // Checks the project in the box, our own rules and the type checker, and answers what the check found.
  check(): Promise<Finding[]>
  // Ends the box: its work stays.
  stop(): Promise<void>
}

/** A command word that holds a path, in double quotes, so that a box reads a path with spaces as one word. */
const quoted = (path: string): string => `"${path}"`

const levels: unknown[] = ['error', 'warning', 'note']

/**
 * One finding as a box printed it, made anew from the fields a finding has: the box is the side that is not
 * trusted, so nothing else it printed is taken. Nothing where what it printed is no finding.
 */
function foundOf(printed: unknown): Finding | undefined {
  const field = (name: string): unknown => Reflect.get(Object(printed), name)
  const [code, message, level, fix] = [field('code'), field('message'), field('level'), field('fix')]
  if (typeof code !== 'string' || typeof message !== 'string' || !levels.includes(level)) return undefined
  const at = (name: string): unknown => Reflect.get(Object(field('where')), name)
  const [file, line, definition] = [at('file'), at('line'), at('definition')]
  const placed =
    typeof file === 'string' && typeof line === 'number'
      ? { where: { file, line, ...(typeof definition === 'string' ? { definition } : {}) } }
      : {}
  const leveled: Finding['level'] = level === 'warning' ? 'warning' : level === 'note' ? 'note' : 'error'
  return finding(code, message, { ...placed, ...(typeof fix === 'string' ? { fix } : {}) }, leveled)
}

/** What `tent <command> --json` printed in a box: its findings, and the version of the bundle where it wrote one. */
function printedOf(out: string): { findings: Finding[]; version?: string } {
  let read: unknown
  try {
    read = JSON.parse(out)
  } catch {
    return { findings: [] }
  }
  const printed: unknown = Reflect.get(Object(read), 'findings')
  const version: unknown = Reflect.get(Object(Reflect.get(Object(read), 'value')), 'version')
  return {
    findings: (Array.isArray(printed) ? printed : []).flatMap((one) => foundOf(one) ?? []),
    ...(typeof version === 'string' ? { version } : {}),
  }
}

/**
 * Takes what the box of a workspace is made with. Answers the box as the workspaces hold it: a build is
 * `tent build --out <work>/builds/<n> --json` in the box, with `--dev` for the test side, whose printed findings are read, and whose bundle the
 * host reads as data and hands to an engine, whose room loads its code. The box is started at the first build.
 */
export function heldBox(o: BoxOptions): HeldBox {
  let box: Box | undefined
  let builds = 0
  /** The box of the workspace: started where none stands, and the one that stands otherwise. */
  const boxNow = async (): Promise<Box> => {
    box ??= await o.sandbox.start({ id: o.id, owner: o.owner, folder: o.folders.project, work: o.folders.box })
    return box
  }
  /** A path as the host reads it, of a path inside the work of the box. */
  const atHost = (inside: string, at: Box): string => join(o.folders.box, inside.slice(at.work.length))

  async function buildNow(kind: 'dev' | 'release'): Promise<BoxBuilt> {
    const at = await boxNow()
    builds += 1
    // Each build writes a folder of its own, so the engine reads the bundle it was handed while a later one is made.
    const out = join(at.work, 'builds', `${Date.now()}-${builds}`)
    rmSync(atHost(out, at), { recursive: true, force: true })
    // The test side is a development build, which the inspect mode reads the places of a page from.
    const ran = await o.sandbox.run(at, `tent build ${kind === 'dev' ? '--dev ' : ''}--out ${quoted(out)} --json`)
    const { findings, version } = printedOf(ran.out)
    const file = join(atHost(out, at), 'description.json')
    if (version === undefined || !existsSync(file)) {
      // A build that wrote nothing tells why: its findings, or else what it printed.
      const told = findings.length
        ? findings
        : [finding('T0011', `The build in the box ended with ${ran.code}: ${ran.err.slice(0, 400)}`, {})]
      return { versionId: '', findings: told, description: Object(undefined), bundle: '' }
    }
    // The description is read as data, as the engine reads that of a bundle: the host never loads what the box built.
    const description = descriptionOf(readFileSync(file, 'utf8'))
    return { versionId: version, findings, description, bundle: atHost(out, at) }
  }

  async function checkNow(): Promise<Finding[]> {
    const at = await boxNow()
    const ran = await o.sandbox.run(at, 'tent check --json')
    const { findings } = printedOf(ran.out)
    // A check that printed nothing it could read tells what it printed, so that it never passes unread.
    if (findings.length || ran.code === 0) return findings
    return [finding('T0011', `The check in the box ended with ${ran.code}: ${ran.err.slice(0, 400)}`, {})]
  }

  // One command at a time in a box: a second waits for the first, for each reads and writes its work.
  let working: Promise<unknown> = Promise.resolve()
  const queued = <Value>(work: () => Promise<Value>): Promise<Value> => {
    const next = working.then(work, work)
    working = next.catch(() => undefined)
    return next
  }
  return {
    build: (asked) => queued(() => buildNow(asked.for)),
    check: () => queued(checkNow),
    async stop() {
      const at = box
      box = undefined
      if (at) await o.sandbox.stop(at)
    },
  }
}
