import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { boolean, text } from '../../../core/index.ts'
import { finding } from '../../../core/internal.ts'
import type { Mode } from '../../../engine/index.ts'
import { installPython } from '../../../engine/index.ts'
import type { Command } from '../../command.ts'

/** The text of a file where it is there, and nothing where it is not. */
const textAt = (file: string): string | undefined => (existsSync(file) ? readFileSync(file, 'utf8') : undefined)

/**
 * `tent python install <target>` makes the environment of each lock of a project or a bundle ahead of the first
 * call of a `python`, where the install has none yet; a project whose check finds an error makes none, and answers
 * those findings. The secrets that an index names are those of the data folder of `--data`, or else of the
 * project's `.tent/`: of test data, and with `--live` of live data.
 */
export const command: Command = {
  name: 'python install',
  args: { target: text({ optional: true }), data: text({ optional: true }), live: boolean({ optional: true }) },
  needs: 'nothing',
  run: async ({ args, folder }) => {
    const target = resolve(folder, typeof args.target === 'string' ? args.target : '.')
    const mode: Mode = args.live === true ? 'live' : 'development'
    const given = typeof args.data === 'string' ? resolve(folder, args.data) : undefined
    const bundle = existsSync(join(target, 'description.json'))
    if (!bundle && !existsSync(join(target, 'tent.ts')))
      return {
        findings: [
          finding('T0001', `${target} holds no project and no bundle.`, {
            fix: 'Name the folder of a project, which holds `tent.ts`, or of a bundle, which holds `description.json`.',
          }),
        ],
      }
    const data = { folder: given ?? join(target, '.tent'), mode }
    // A project is described by the build tools, which are loaded only for a project: a bundle needs none.
    const described = bundle ? undefined : await (await import('../../../build/index.ts')).describeProject(target)
    // A project that does not hold to its rules, as a lock with a line that is an option, is installed from nothing.
    const errors = described?.findings.filter((one) => one.level === 'error') ?? []
    if (described && (errors.length || !described.description)) return { findings: described.findings }
    return answered(
      await installPython(
        described?.description
          ? { description: described.description, lock: (file) => textAt(join(target, file)), data }
          : { bundle: target, data },
      ),
    )
  },
}

/** What the command answers of what was installed: each environment, and each lock that failed as a finding. */
function answered(done: Awaited<ReturnType<typeof installPython>>) {
  return {
    value: { environments: done.environments.map(({ lock, folder: lies, made }) => ({ lock, folder: lies, made })) },
    findings: done.failed.map(({ lock, error }) =>
      finding(error.code, error.message, {
        ...(error.fix === undefined ? {} : { fix: error.fix }),
        where: { file: lock, line: 1 },
      }),
    ),
  }
}
