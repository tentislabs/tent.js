import type { Source } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import { rulesOver } from './rulesOver.ts'

/**
 * Takes the folder of a project, and with it the facts of the running app. Describes the project and carries out
 * every rule of our own on it, with no type checker started.
 * Answers every finding at once, the description and the source they were found in, and for each code definition
 * what made it code.
 */
export async function checkRules(
  folder: string,
  o: { facts?: Facts } = {},
): Promise<{ findings: Finding[]; description: Description; source: Source; why: Record<string, string> }> {
  const { facts } = o
  // The build is loaded where a project is checked, and not by a program that only runs one.
  const { describeProject } = await import('../build/index.ts')
  const { description, findings, source, why } = await describeProject(folder)
  findings.push(...(await rulesOver({ description, source, ...(facts ? { facts } : {}) })))
  return { findings, description, source, why }
}
