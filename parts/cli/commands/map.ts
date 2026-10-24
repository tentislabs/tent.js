import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject, describeProject } from '../../build/index.ts'
import { outline } from '../../core/internal.ts'
import type { Command } from '../command.ts'
import { guardOf } from '../guarded.ts'

/** The bytes of each file of a bundle, by its path in the bundle. */
const sizesIn = (folder: string): Record<string, number> =>
  Object.fromEntries(
    readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((one) => one.isFile())
      .map((one) => {
        const lies = join(one.parentPath, one.name)
        return [lies.slice(folder.length + 1).replaceAll('\\', '/'), statSync(lies).size]
      }),
  )

/**
 * Prints the whole app as a short outline: tables with columns, functions with inputs and rules, flows with steps,
 * the packages it imports with who uses them, their bytes in the page and their ways out, screens with their
 * addresses, data, calls and components, and the bytes of each style file and each module of a view. The project is built for release, so that what a package weighs in the
 * page is known; one that cannot be built is outlined as it is described.
 */
export const command: Command = {
  name: 'map',
  args: {},
  needs: 'project',
  run: async ({ folder }) => {
    const built = await buildProject(folder, { for: 'release', ...guardOf(folder) })
    const errors = built.findings.filter((one) => one.level === 'error')
    if (!errors.length)
      return { value: outline(built.description, built.drawn, sizesIn(built.bundleFolder)), findings: [] }
    const { description, findings } = await describeProject(folder)
    return { value: outline(description), findings: findings.filter((one) => one.level === 'error') }
  },
}
