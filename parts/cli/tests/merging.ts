import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { describeProject } from '../../build/index.ts'
import type { Description } from '../../core/internal.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import { copied } from './typed.ts'

/** Who writes the points of these tests. */
export const ada = { kind: 'person', id: 'ada' } as const

/** Changes of the files of a project: for each file, texts each with the one to put in its place, or a whole text. */
export type Edits = Record<string, [string, string][] | string>

/** Makes the changes of the files of a project. Each text that is replaced must stand in its file. */
export function edit(project: string, edits: Edits): void {
  for (const [path, changes] of Object.entries(edits)) {
    const lies = join(project, path)
    if (typeof changes === 'string') {
      writeFileSync(lies, changes)
      continue
    }
    let text = readFileSync(lies, 'utf8')
    for (const [from, to] of changes) {
      assert.ok(text.includes(from), `${path} holds ${JSON.stringify(from)}`)
      text = text.replace(from, to)
    }
    writeFileSync(lies, text)
  }
}

/** The description of a project as its files stand, which must describe with no error. */
export async function describedNow(project: string): Promise<Description> {
  const { description, findings } = await describeProject(project)
  assert.deepEqual(
    findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return description
}

/** The project and history of two sides of a merge: main, which `now` stands on, and side. */
export interface TwoSides {
  project: string
  history: History
  texts: { base: Record<string, string>; ours: Record<string, string>; theirs: Record<string, string> }
}

const textsOf = (project: string, edits: Edits[]): Record<string, string> =>
  Object.fromEntries(
    [...new Set(edits.flatMap((one) => Object.keys(one)))].map((path) => {
      try {
        return [path, readFileSync(join(project, path), 'utf8')]
      } catch {
        return [path, '']
      }
    }),
  )

/**
 * A copy of the project `merging` with its history: a point of its files as they lie, a branch `side` at it with
 * the changes of theirs recorded on it, and main with the changes of ours recorded, each with its description.
 * `now` ends on main. The history is closed before the folder is removed.
 */
export async function twoSides(t: TestContext, name: string, ours: Edits, theirs: Edits): Promise<TwoSides> {
  let history: History | undefined
  t.after(() => history?.close())
  const project = copied(t, name, 'merging')
  history = openHistory(join(project, '.tent'))
  const base = textsOf(project, [ours, theirs])
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  history.branch('side')
  history.switch(project, 'side', ada)
  edit(project, theirs)
  const theirsTexts = textsOf(project, [ours, theirs])
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  history.switch(project, 'main', ada)
  edit(project, ours)
  const oursTexts = textsOf(project, [ours, theirs])
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  return { project, history, texts: { base, ours: oursTexts, theirs: theirsTexts } }
}

/** The text of a file of a project as it lies. */
export const textIn = (project: string, path: string): string => readFileSync(join(project, path), 'utf8')
