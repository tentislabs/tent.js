import { resolve } from 'node:path'
import type { Finding } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import { checkRules } from './ours.ts'
import { checkTypes } from './types.ts'
import { withColumns } from './typeWords.ts'

// The two halves of the check, for a program that runs them apart: our own rules over what a build of a save
// read, and the type checker kept running beside them.
export { rulesOver } from './rulesOver.ts'
export type { RulesThread } from './rulesThread.ts'
export { rulesThread } from './rulesThread.ts'
export { keepTypes } from './types.ts'

/** Whether a stored record, or anything inside it, is stored as code. */
function holdsCode(record: unknown): boolean {
  if (Array.isArray(record)) return record.some(holdsCode)
  if (typeof record !== 'object' || record === null) return false
  return typeof Reflect.get(record, 'export') === 'string' || Object.values(record).some(holdsCode)
}

/**
 * The form of each definition of a description: `'code'` where its record, or a rule of it, is stored as code, and
 * for every screen and component, whose view is code.
 */
function formsOf(description: Description): Record<string, 'plain' | 'code'> {
  const forms: Record<string, 'plain' | 'code'> = {}
  const groups = [
    description.tables,
    description.functions,
    description.flows,
    description.services,
    description.models,
    description.routes,
    description.incoming,
    description.commands,
  ]
  for (const group of groups)
    for (const [name, record] of Object.entries(group))
      forms[name] = record.form === 'code' || holdsCode(record) ? 'code' : 'plain'
  for (const group of [description.screens, description.components])
    for (const name of Object.keys(group)) forms[name] = 'code'
  if (description.app.name) forms[description.app.name] = holdsCode(description.project) ? 'code' : 'plain'
  return forms
}

/**
 * Takes the folder of a project, and with it `facts`, what only the running app knows. Builds
 * the description, carries out every rule, has the type checker read the whole project, and answers every
 * finding at once: it never stops at the first. Answers with them the form of each definition, and for each code
 * definition what made it code. It opens no database and changes no file but the type list of the project.
 */
export async function checkProject(
  folder: string,
  o: { facts?: Facts } = {},
): Promise<{ findings: Finding[]; forms: Record<string, 'plain' | 'code'>; why: Record<string, string> }> {
  // The type checker is started in the folder and handed the place of its settings: both by the whole path.
  const whole = resolve(folder)
  const { findings, description, source, why } = await checkRules(whole, o)
  findings.push(...(await checkTypes(whole, source)).map((one) => withColumns(description, one)))
  return { findings, forms: formsOf(description), why }
}
