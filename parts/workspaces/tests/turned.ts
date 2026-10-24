import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import type { WorkspacesOptions } from '../index.ts'
import type { Product } from './held.ts'
import { folderOf, held, nobody, product } from './held.ts'
import type { Scripted, ScriptedModel, Tooled } from './tooled.ts'
import { scripted, toolTemplates } from './tooled.ts'

/** The workspaces of the builder product with a workspace of an owner, and the row of a project that is its thread. */
export interface Turned extends Tooled {
  thread: string
}

/**
 * Makes the workspaces of the builder product with these options over the product of `at`, or a new one, a user of
 * it, a workspace of that user from a template, the notes one where none is named, and the project row whose
 * conversation the turns hold.
 */
export async function turned(
  t: TestContext,
  o: Partial<WorkspacesOptions> = {},
  at?: Product,
  from = 'notes',
): Promise<Turned> {
  const made = await held(t, { templates: toolTemplates, ...o }, at ?? (await product(t, folderOf(t), 'builder')))
  const [row] = Object(
    await made.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], {
      as: 'system',
    }),
  )
  const owner = String(Object(row).id)
  const caller: Caller = { kind: 'user', user: { id: owner, roles: [] } }
  const workspace = await made.workspaces.create({ owner, from })
  await made.workspaces.run(workspace.id)
  const [project] = Object(
    await made.app.write([{ add: 'projects', values: { owner, workspace: workspace.id } }], { as: 'system' }),
  )
  return {
    ...made,
    owner,
    caller,
    made: workspace,
    thread: String(Object(project).id),
    tool: (name, input, agent = 'builder') => made.workspaces.tool(workspace.id, name, input, { caller, agent }),
  }
}

/** The text of the last message a model was sent, and whether it is the answer of a tool. */
const lastOf = (request: ReplyRequest): { text: string; tool: boolean } => {
  const last = request.messages.at(-1)
  return { text: String(last?.text ?? ''), tool: last?.who === 'tool' }
}

/** A query of the notes, as a plain file that a turn writes: its name and its limit say the turn. */
const queryOf = (n: number): string =>
  [
    "import { anyone, query } from 'tentjs'",
    "import { notes } from '../tables/users'",
    '',
    `export const counted${n} = query('counted${n}', {`,
    `  about: 'The notes of turn ${n}',`,
    "  access: anyone('the notes of a test app'),",
    `  rows: notes.newest('createdAt').limit(${n}),`,
    '})',
    '',
  ].join('\n')

/**
 * The model of the turns of these tests: told `turn <n>`, it writes the query of that turn into one file and adds a
 * note through the tool `run`; told what a tool answered, it is done. `more` answers in place of that for a request
 * it gives an answer for.
 */
export function turnModel(more?: (request: ReplyRequest, n: number) => Scripted | undefined): ScriptedModel {
  return scripted((request, n) => {
    const given = more?.(request, n)
    if (given) return given
    const last = lastOf(request)
    if (last.tool) return { text: 'Done.' }
    const found = /turn (\d+)/.exec(last.text)
    if (!found) return { text: 'Done.' }
    const turn = Number(found[1])
    return {
      calls: [
        { tool: 'write', with: { path: 'functions/counted.ts', text: queryOf(turn) } },
        { tool: 'run', with: { name: 'addNote', input: { body: `note of turn ${turn}` } } },
      ],
    }
  })
}

/** The files of a project, each by its path, as their bytes: but those the framework writes itself. */
export function filesOf(folder: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const shown = relative(folder, path).replaceAll('\\', '/')
      if (shown === '.tent' || shown === 'tent.d.ts') continue
      if (statSync(path).isDirectory()) walk(path)
      else files[shown] = readFileSync(path).toString('base64')
    }
  }
  walk(folder)
  return files
}

/** The notes of the test data of the workspace, as the app of the workspace reads them: their ids, times and words. */
export async function notesOf(at: Turned): Promise<unknown> {
  const app = await at.workspaces.run(at.made.id)
  return app.call('allNotes', {}, { as: nobody })
}
