import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { projectFiles } from './projectFiles.ts'

/**
 * Copies the files of a project from one folder into another, a template or the project of a workspace. A link is
 * not followed and not copied, so a template that holds a link out of its folder brings nothing of the outside.
 */
export function copyProject(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const source of projectFiles(from)) {
    const target = join(to, relative(from, source))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
}
