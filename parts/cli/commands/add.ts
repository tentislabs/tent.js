import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { commandPoint } from '../commandPoint.ts'

/**
 * Installs an npm package into the project, with install scripts switched off unless `--allow-scripts` is given.
 * A point of the history is recorded before and one after, so the install can be undone.
 */
export const command: Command = {
  name: 'add',
  args: { package: text(), 'allow-scripts': boolean() },
  needs: 'project',
  run: async ({ args, folder }) => {
    const named = String(args.package)
    // What starts with a hyphen would be read by npm as a flag of its own, and no package is named so.
    if (named.startsWith('-')) throw new Error(`"${named}" is no name of a package.`)
    const scripts = args['allow-scripts'] === true
    // npm installs into the nearest folder above that holds a package file: so the project must hold its own,
    // which `tent new` wrote.
    const file = join(folder, 'package.json')
    if (!existsSync(file))
      throw new Error(
        'The project has no `package.json`, which `tent new` writes. Write one with `{ "private": true, "type": "module" }`, and type the command again.',
      )
    const words = ['install', '--prefix', folder, '--no-audit', '--no-fund', ...(scripts ? [] : ['--ignore-scripts'])]
    await commandPoint(folder)
    // The build, which holds the one wrapper of npm, is loaded where a command needs it, and not at the top.
    const { npm } = await import('../../build/index.ts')
    const done = npm(folder, [...words, '--', named])
    await commandPoint(folder)
    if (done.status !== 0) throw new Error(`npm could not install ${named}:\n${done.said}`)
    const dependencies: unknown = Object(JSON.parse(readFileSync(file, 'utf8'))).dependencies ?? {}
    return { value: { package: named, scripts, dependencies } }
  },
}
