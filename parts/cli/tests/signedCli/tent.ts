import { anyone, date, grants, json, list, object, project, query, table, text } from 'tentjs'

// An app with a command line and a door for MCP, which a person signs its command line into in the browser.
export const signedCli = project('signedCli', {
  title: 'Signed CLI',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
})

export const users = table('users', { columns: { email: text(), roles: list(text()) }, access: { read: 'owner' } })

export const whoAmI = query('whoAmI', {
  about: 'Who the caller is',
  access: 'signedIn',
  offer: ['cli', 'mcp'],
  input: {},
  output: text(),
  run: ({ user }) => `you are ${user?.id}`,
})

export const grantsOf = query('grantsOf', {
  access: anyone('the tests read the grants of a person'),
  system: 'reads the grants of any user',
  input: { user: text() },
  output: list(object({ id: text(), client: text(), name: text(), scopes: list(text()), for: text(), createdAt: date(), usedAt: date(), reusedAt: date({ optional: true }) })),
  run: ({ input }) => grants.list(input.user),
})
