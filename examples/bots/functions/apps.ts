import { boolean, change, choice, fail, link, object, query, text } from 'tentjs'
import { apps } from '../tables/apps'

export const appList = query('appList', {
  about: 'The apps of the person, each an MCP server that a bot may be let use',
  access: 'signedIn',
  rows: apps.oldest('createdAt').limit(100),
})

export const addApp = change('addApp', {
  about: 'Adds an app: an MCP server started by its command, or reached at its address',
  access: 'signedIn',
  input: {
    name: text({ min: 1, max: 60 }),
    about: text({ max: 300, default: '' }),
    icon: choice(['files', 'browser', 'calendar', 'mail', 'other'], { default: 'other' }),
    command: text({ max: 1000, optional: true }),
    address: text({ max: 1000, optional: true }),
  },
  output: object({ id: link('apps') }),
  run: ({ input, db, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    if (!input.command === !input.address)
      return fail('how', 'Give the app its command or its address, one of them.', {
        fields: { address: 'Give a command or an address.' },
      })
    if (input.address && !/^https?:\/\/\S+$/.test(input.address))
      return fail('address', 'An address starts with http:// or https://.', { fields: { address: 'No address.' } })
    return db.apps.add({ ...input, owner: user.id })
  },
})

export const dropApp = change('dropApp', {
  about: 'Removes an app, and takes it from every bot',
  access: 'signedIn',
  input: { id: link('apps') },
  run: ({ input, db }) => {
    for (const one of db.bots.oldest('createdAt').limit(500).all())
      db.bots.change(one.id, { apps: one.apps.filter((app) => app !== input.id) })
    db.apps.remove(input.id)
  },
})

export const setBotApp = change('setBotApp', {
  about: 'Lets a bot use an app, or takes it away',
  access: 'signedIn',
  input: { bot: link('bots'), app: link('apps'), on: boolean() },
  run: ({ input, db }) => {
    const one = db.bots.get(input.bot)
    if (!one) return fail('no-such-bot', 'That bot is not there.')
    if (!db.apps.get(input.app)) return fail('no-such-app', 'That app is not there.')
    const others = one.apps.filter((app) => app !== input.app)
    return db.bots.change(one.id, { apps: input.on ? [...others, input.app] : others })
  },
})
