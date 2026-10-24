import { action, fail, input, link, query } from 'tentjs'
import { spawn } from 'node:child_process'
import { memories } from '../tables/memories'

export const talkOf = query('talkOf', {
  about: 'The talk of one bot, the oldest first: what the person said, what the bot wrote, and what it did',
  access: 'signedIn',
  input: { bot: link('bots') },
  rows: memories
    .where({ bot: input('bot') })
    .pick(['id', 'who', 'text', 'data', 'run', 'createdAt'])
    .oldest('createdAt')
    .limit(1000),
})

// "Take over" opens the bot's own folder on this computer, in the system's own file window.
export const openFolder = action('openFolder', {
  about: "Opens the bot's own folder on this computer",
  access: 'signedIn',
  input: { bot: link('bots') },
  run: async ({ input, db }) => {
    const one = await db.bots.get(input.bot)
    if (!one) return fail('no-such-bot', 'That bot is not there.')
    if (!one.folder) return fail('no-folder', 'The bot has no folder yet: it makes one at its first run.')
    const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    spawn(opener, [one.folder], { detached: true, stdio: 'ignore' }).unref()
    return { opened: one.folder }
  },
})
