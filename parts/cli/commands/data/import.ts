import { resolve } from 'node:path'
import { boolean, list, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked, askedOfRunning } from '../../reach.ts'

// How often the line that says how far an import came is written anew, in milliseconds.
const every = 1000

/**
 * Has the engine import a file of records, each through a change of the app: `--with` names the change, `--map`
 * a field of the input for a field of the file, `--language` the language of its values, `--as` the caller, and
 * `--dry` checks every record and writes nothing. While it runs, a line says how far it came.
 */
export const command: Command = {
  name: 'data import',
  args: {
    file: text(),
    with: text(),
    map: list(text(), { optional: true }),
    language: text({ optional: true }),
    as: text({ optional: true }),
    dry: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  async run({ args, folder }) {
    const file = resolve(folder, String(args.file))
    const where = { folder, data: args.data }
    // The engine is asked again only once it answered the question before: a slow answer stacks no questions.
    let looking = true
    let ticker: NodeJS.Timeout | undefined
    const look = async (): Promise<void> => {
      const now = await askedOfRunning(where, 'data', { what: 'import', file, progress: true }).catch(() => undefined)
      const done: unknown = Reflect.get(Object(now?.value), 'done')
      const of: unknown = Reflect.get(Object(now?.value), 'of')
      if (looking && typeof done === 'number' && typeof of === 'number')
        process.stderr.write(`\r${done} of ${of} records`)
      if (looking) ticker = setTimeout(() => void look(), every)
    }
    ticker = setTimeout(() => void look(), every)
    try {
      return await asked(where, 'data', {
        what: 'import',
        file,
        with: args.with,
        ...(Array.isArray(args.map) ? { map: args.map } : {}),
        ...(typeof args.language === 'string' ? { language: args.language } : {}),
        ...(typeof args.as === 'string' ? { as: args.as } : {}),
        ...(args.dry === true ? { dry: true } : {}),
      })
    } finally {
      looking = false
      clearTimeout(ticker)
    }
  },
}
