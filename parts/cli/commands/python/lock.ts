import { join } from 'node:path'
import { lockProject } from '../../../build/index.ts'
import { TentError } from '../../../core/index.ts'
import { finding } from '../../../core/internal.ts'
import type { Command } from '../../command.ts'
import { commandPoint } from '../../commandPoint.ts'
import type { Mode } from '../../../engine/index.ts'
import { pythonInstaller } from '../../../engine/index.ts'

/**
 * `tent python lock` resolves the `packages` of every `python` of the project, for the three systems, into
 * `python.lock` in its root, and into `python.<name>.lock` for each `lock` that a definition names. The installer
 * and the Python of the lock are fetched at their first use. An index of `python.index` opens its secrets of test data.
 */
export const command: Command = {
  name: 'python lock',
  args: {},
  needs: 'project',
  run: async ({ folder }) => {
    try {
      const data: { folder: string; mode: Mode } = { folder: join(folder, '.tent'), mode: 'development' }
      // What the command writes is held between two points of the history, so it can be gone back from.
      await commandPoint(folder)
      const made = await lockProject(folder, (python) => pythonInstaller({ data, stated: python }))
      await commandPoint(folder)
      return { value: { python: made.python, written: made.written }, findings: made.findings }
    } catch (error) {
      if (!(error instanceof TentError)) throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    }
  },
}
