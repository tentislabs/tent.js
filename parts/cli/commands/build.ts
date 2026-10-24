import { resolve } from 'node:path'
import { buildProject } from '../../build/index.ts'
import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { guardOf } from '../guarded.ts'
import { launchProject } from '../launcher.ts'
import { withText } from '../print.ts'

/**
 * Writes a bundle into `.tent/build/` of the project, or into the folder that `--out` names: a release, or with
 * `--dev` a development build, which the inspect mode reads the places of a page from.
 */
export const command: Command = {
  name: 'build',
  args: { out: text({ optional: true }), dev: boolean({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const out = typeof args.out === 'string' ? { out: resolve(args.out) } : {}
    const { findings, bundleFolder, versionId, description } = await buildProject(folder, {
      for: args.dev === true ? 'dev' : 'release',
      ...out,
      ...guardOf(folder),
    })
    // With an error among the findings no bundle is written, and there is no version to name.
    if (!versionId) return { findings }
    // A project that has commands is given its launcher in `.tent/bin/`, which runs them with no `tent cli`.
    launchProject(folder, bundleFolder)
    // What each of the project's own packages weighs in the page is told, and never refused.
    const packages = Object.fromEntries(
      Object.entries(description.packages ?? {})
        .filter(([, one]) => one.browser === true)
        .map(([name, one]) => [name, Number(one.bytes ?? 0)])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
    const value = { version: versionId, bundle: bundleFolder, ...(Object.keys(packages).length ? { packages } : {}) }
    const told = Object.entries(packages).map(([name, bytes]) => `  ${name}: ${bytes} bytes in the page`)
    const text = [`version: ${versionId}`, `bundle: ${bundleFolder}`, ...(told.length ? ['packages:', ...told] : [])]
    return { value: withText(value, text.join('\n')), findings }
  },
}
