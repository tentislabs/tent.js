import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describeProject } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { limitDefaults } from '../core/internal.ts'
import type { Point } from '../history/index.ts'
import { filesPrint } from './built.ts'
import { boxedOf } from './opening.ts'
import { pathIn, pathOf } from './paths.ts'
import { needsOf, refusedBy } from './policy.ts'
import { historyOf } from './state.ts'
import type { ToolAt } from './tools/face.ts'

/** What the reader of a workspace's project read of it now: its description and what it found. */
export interface Described {
  description?: Description
  findings: Finding[]
}

/**
 * Reads the project of a workspace where the tool reads it: as the build reads it in the host, for a workspace whose
 * code the host runs; or built in its box, whose description is read as data.
 */
export async function describedNow(at: ToolAt): Promise<Described> {
  const { one, form } = at
  // What was read is read again only once a file changed, or another form is asked.
  const print = `${form} ${filesPrint(one.folders.project)}`
  if (one.described?.print === print) return one.described.read
  const read = await describedAnew(at)
  one.described = { print, read }
  return read
}

/** Reads the project of a workspace anew, as `describedNow` says. */
async function describedAnew(at: ToolAt): Promise<Described> {
  const { one, form } = at
  if (form === 'box') {
    const built = await boxedOf(at.held, one).build({ for: 'dev' })
    return { ...(built.versionId ? { description: built.description } : {}), findings: built.findings }
  }
  const read = await describeProject(one.folders.project)
  return { description: read.description, findings: read.findings }
}

/** One file that a tool writes: its path in the project, and its new text, or nothing where the file is removed. */
export interface Writing {
  path: string
  text?: string
}

/** The error of a file larger than a tool may write at once, `callSize` (1 MB). */
const tooLarge = (path: string): TentError =>
  new TentError('T0003', `The text of ${path} is larger than a tool writes at once.`, {
    fix: 'Write the file in pieces, with `edit`, or keep what is large as an asset.',
  })

/**
 * Takes where a tool works, the files it writes, and what the write is: the tool, and a definition it renamed.
 * Holds the paths to the project, writes the files, reads the project again as the policy says, and holds what
 * changed against the policy. A write that the policy refuses is undone, and is T9105 with the rule. A write that
 * `ask` names is undone, the person is asked, and it is written again after their yes. Then a point of the kind
 * `command` is recorded, by whoever acts, with the description. Answers the point.
 */
export async function writeHeld(
  at: ToolAt,
  writes: Writing[],
  o: { tool: string; renamed?: { from: string; to: string }; free?: string[] },
): Promise<{ point: Point; findings: Finding[] }> {
  const project = at.one.folders.project
  const places = writes
    .map((one) => ({
      ...one,
      place: pathIn(project, one.path, { writes: true, engine: at.policy.also.includes('engine') }),
    }))
    .map((one) => ({ ...one, file: pathOf(project, one.place) }))
  const most = Number(limitDefaults.project.callSize)
  for (const one of places) if (one.text !== undefined && Buffer.byteLength(one.text) > most) throw tooLarge(one.path)
  const before = await describedNow(at)
  const old = places.map((one) => (existsSync(one.place) ? readFileSync(one.place) : undefined))
  const apply = (): void => {
    for (const one of places) {
      if (one.text === undefined) rmSync(one.place, { force: true })
      else {
        mkdirSync(dirname(one.place), { recursive: true })
        writeFileSync(one.place, one.text)
      }
    }
  }
  const undo = (): void => {
    places.forEach((one, k) => {
      const was = old[k]
      if (was === undefined) rmSync(one.place, { force: true })
      else writeFileSync(one.place, was)
    })
  }
  apply()
  let after: Described
  try {
    after = await describedNow(at)
    // An option that the reader does not know is in no description, so no rule of the policy could hold it.
    const files = new Set(places.map((one) => one.file))
    const unknown = after.findings.find(
      (one) => one.code === 'T1003' && one.level === 'error' && files.has(String(one.where?.file ?? '')),
    )
    if (unknown) throw refusedBy(`unknown option: ${unknown.message}`)
    const asks = new Set<string>(at.policy.ask.includes(o.tool) ? [o.tool] : [])
    const written = places.map((one) => ({ path: one.file, removed: one.text === undefined }))
    const needs = needsOf(at.policy, before.description, after.description, written, o)
    if (needs.refused) throw refusedBy(needs.refused)
    for (const ask of needs.asks) asks.add(ask)
    if (asks.size) {
      // Nothing stands written while the person is asked: the step is made again after their yes.
      undo()
      await at.ask({ tool: o.tool, paths: writes.map((one) => one.path), asks: [...asks] })
      apply()
    }
  } catch (error) {
    undo()
    throw error
  }
  const errors = after.findings.filter((one) => one.level === 'error')
  const point = historyOf(at.one).record(project, {
    by: at.by,
    kind: 'command',
    checked: errors.length === 0,
    ...(after.description ? { description: after.description } : {}),
  })
  return { point, findings: after.findings }
}
