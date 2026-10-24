import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { text } from '../../core/index.ts'
import { coreVersion, finding } from '../../core/internal.ts'
import { agentsText } from '../../docs/index.ts'
import { shippedRelease } from '../../engine/index.ts'
import type { Command } from '../command.ts'
import { commandPoint } from '../commandPoint.ts'
import { sampleFiles } from '../sample.ts'

/** Makes a bare project folder - one screen and the query it reads, and `AGENTS.md` - and records the first point of its history. */
export const command: Command = {
  name: 'new',
  args: { name: text() },
  needs: 'nothing',
  run: async ({ args, folder }) => {
    const typed = String(args.name)
    if (!/^[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$/.test(typed))
      throw new Error(`"${typed}" is no name of a project: write letters and digits, with a hyphen between words.`)
    const lies = join(folder, typed)
    if (existsSync(lies) && readdirSync(lies).length) throw new Error(`The folder ${typed} is there, and holds files.`)
    // The name of the definition is the name of the folder in camelCase, and its title the same in words.
    const words = typed.split('-')
    const name = words
      .map((word, k) => (k ? word[0].toUpperCase() + word.slice(1) : word[0].toLowerCase() + word.slice(1)))
      .join('')
    const title = words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
    // An ordinary package file, which `tent add` writes a package into: the framework stands in it as what the
    // project runs on. A release names its own version, which npm installs into the project, so that the project
    // is built by that version on every computer.
    const shipped = shippedRelease()
    const about = {
      name: typed.toLowerCase(),
      private: true,
      type: 'module',
      engines: { tentjs: coreVersion },
      ...(shipped ? { dependencies: { tentjs: shipped.version } } : {}),
    }
    const files = {
      ...sampleFiles(name, title),
      'package.json': `${JSON.stringify(about, null, 2)}\n`,
      'AGENTS.md': agentsText(),
    }
    for (const [path, written] of Object.entries(files)) {
      mkdirSync(dirname(join(lies, path)), { recursive: true })
      writeFileSync(join(lies, path), written)
    }
    // Before there was nothing: the first point of the history holds the files as they were made.
    await commandPoint(lies)
    // The version is installed with the npm at hand: the one the build tools ship.
    const installed = shipped
      ? (await import('../../build/index.ts')).npm(lies, ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
      : undefined
    const unInstalled =
      installed && installed.status !== 0
        ? [
            finding(
              'T0016',
              `npm could not install tentjs ${shipped?.version} into ${typed}:
${installed.said}`,
              {
                fix: `Run npm install in ${typed} once this computer reaches the registry.`,
              },
              'warning',
            ),
          ]
        : []
    return {
      value: { folder: typed, files: Object.keys(files).sort() },
      ...(unInstalled.length ? { findings: unInstalled } : {}),
    }
  },
}
