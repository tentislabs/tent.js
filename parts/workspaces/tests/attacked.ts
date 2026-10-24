import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { WorkspacesOptions } from '../index.ts'
import { folderOf, held, product } from './held.ts'
import type { Tooled } from './tooled.ts'
import { toolTemplates } from './tooled.ts'

/** The templates of the attack tests: those of the project tools, and one whose route answers what a request carried. */
const attackTemplates = { ...toolTemplates, echoed: join(import.meta.dirname, 'echoed') }

/**
 * Makes the workspaces of the product of the attack tests, whose agents hold the policies the attacks need, a
 * user of it who owns a workspace made from a template, and that user as a caller.
 */
export async function attacked(t: TestContext, o: Partial<WorkspacesOptions> = {}, from = 'notes'): Promise<Tooled> {
  const at = await held(t, { templates: attackTemplates, ...o }, await product(t, folderOf(t), 'attacker'))
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], { as: 'system' }),
  )
  const owner = String(Object(row).id)
  const caller: Caller = { kind: 'user', user: { id: owner, roles: [] } }
  const made = await at.workspaces.create({ owner, from })
  return {
    ...at,
    owner,
    caller,
    made,
    tool: (name, input, agent = 'builder') => at.workspaces.tool(made.id, name, input, { caller, agent }),
  }
}

/** Every file of the project of a workspace with its bytes, by its path, but `tent.d.ts`, which the build writes. */
export function projectFiles(workspace: string): Record<string, string> {
  const folder = join(workspace, 'project')
  const found: Record<string, string> = {}
  const walk = (at: string, shown: string): void => {
    for (const name of readdirSync(at).sort()) {
      const place = join(at, name)
      const path = `${shown}${name}`
      if (path === 'tent.d.ts' || path === '.tent') continue
      if (statSync(place).isDirectory()) walk(place, `${path}/`)
      else found[path] = readFileSync(place).toString('base64')
    }
  }
  if (existsSync(folder)) walk(folder, '')
  return found
}

/** A plain query file over the notes, with one more option stated on the query. */
export const queryWith = (name: string, more = ''): string =>
  [
    "import { anyone, query } from 'tentjs'",
    "import { notes } from '../tables/users'",
    '',
    `export const ${name} = query('${name}', {`,
    "  access: anyone('the notes of a test app'),",
    ...(more ? [`  ${more},`] : []),
    '  rows: notes.limit(10),',
    '})',
    '',
  ].join('\n')
