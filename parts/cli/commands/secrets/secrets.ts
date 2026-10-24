import { boolean, choice, TentError, text } from '../../../core/index.ts'
import { finding } from '../../../core/internal.ts'
import type { Command } from '../../command.ts'
import { newSecretKey, replaceSecretKey } from '../../../engine/index.ts'
import { hiddenValue } from '../../hidden.ts'
import { dataFolderOf } from '../../reach.ts'

/**
 * `tent secrets key` prints a new key and keeps nothing: it is how the value of `TENT_SECRET_KEY` is made. With `--replace`, and the engine stopped, it
 * makes a new key and seals every secret and every sealed value again under it.
 */
export const command: Command = {
  name: 'secrets',
  args: {
    do: choice(['key']),
    replace: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    if (args.replace !== true) return { value: { key: newSecretKey() } }
    try {
      return { value: await replaceSecretKey(dataFolderOf({ folder, data: args.data }), { kept }) }
    } catch (error) {
      if (!(error instanceof TentError)) throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    }
  },
}

/**
 * Where the key is given by a variable, the new one is printed, and the command waits for a yes that it was kept:
 * nothing is sealed under a key that nobody holds.
 */
async function kept(key: string): Promise<boolean> {
  process.stderr.write(`The new key of the secrets, to give the engine as TENT_SECRET_KEY from now on:\n${key}\n`)
  return /^y(es)?$/i.test((await hiddenValue('Type yes when it is kept: ')).trim())
}
