import { resolve } from 'node:path'
import { buildProject } from '../../build/index.ts'
import { choice, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { guardOf } from '../guarded.ts'
import { asked, dataFolderOf } from '../reach.ts'

/**
 * `tent export --out <folder>`: writes the site, or the public part of the app, out as files for any host of
 * files. It builds the project as a release and has the engine that runs on the data folder write it out with
 * its data; with none running it starts one for the length of the command.
 */
export const command: Command = {
  name: 'export',
  args: {
    out: text(),
    base: text({ optional: true }),
    origin: text({ optional: true }),
    names: choice(['plain', 'any'], { optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const { data, out, ...asking } = args
    // The pages go to a host of files: the guard searches them for every secret value of the data folder.
    const built = await buildProject(folder, { for: 'release', ...guardOf(folder, dataFolderOf({ folder, data })) })
    if (built.findings.some((one) => one.level === 'error')) return { findings: built.findings }
    return asked({ folder, data }, 'export', {
      ...asking,
      out: resolve(folder, String(out)),
      bundle: built.bundleFolder,
    })
  },
}
