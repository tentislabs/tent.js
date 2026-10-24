import { TentError } from '../../core/index.ts'
import { runnerFolder, shippedRelease } from '../../engine/index.ts'
import type { Command } from '../command.ts'
import { removeInstall } from '../install/removeInstall.ts'
import { processTerminal } from '../terminal.ts'

/**
 * Removes the install: it asks first, then takes `bin/` off the path, and removes the folder of the install. Under
 * the npm door it is typed before `npm uninstall -g tentjs`, and says so. With nobody to answer it ends with 2, and
 * removes nothing.
 */
export const command: Command = {
  name: 'uninstall',
  args: {},
  needs: 'nothing',
  run: async () => {
    const home = runnerFolder()
    const { terminal, close } = processTerminal()
    let said: string | undefined
    try {
      terminal.error(`This removes Tent.js from ${home}. Remove it? (yes or no) `)
      said = await terminal.line()
    } finally {
      close()
    }
    if (said === undefined)
      throw new TentError('T0013', 'Nobody answered whether to remove the install: nothing was removed.', {
        fix: 'Type tent uninstall at a terminal, or hand it the answer yes on its input.',
      })
    if (!['yes', 'y'].includes(said.trim().toLowerCase())) return { value: { removed: false } }
    await removeInstall(home)
    // Under the npm door the package itself is npm's to remove.
    const npmDoor = shippedRelease()?.player.split(/[\\/]/).includes('node_modules') === true
    if (npmDoor) terminal.error('Now type npm uninstall -g tentjs, which removes the package.\n')
    return { value: { removed: home } }
  },
}
