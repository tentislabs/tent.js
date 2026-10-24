import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** Every new picture and every new thing heard under a folder, each with the name it is kept under. */
function freshUnder(folder: string): [string, string][] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry): [string, string][] => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return freshUnder(path)
    const found = /^(.+)\.new\.(png|txt)$/.exec(entry.name)
    return found ? [[path, join(folder, `${found[1]}.${found[2]}`)]] : []
  })
}

/**
 * `tent test --looks update`: keeps every new picture and every new thing heard that the tests of a project wrote,
 * under its name, in the place of what was kept. Answers the paths it kept, from the folder of the project.
 */
export function keepLooks(project: string): string[] {
  const kept: string[] = []
  for (const kind of ['looks', 'heard'])
    for (const [fresh, name] of freshUnder(join(project, 'tests', kind))) {
      renameSync(fresh, name)
      kept.push(name.slice(project.length + 1).replaceAll('\\', '/'))
    }
  return kept.sort()
}
