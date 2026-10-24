import { action, connections, flow, json, list, query, table, text } from 'tentjs'
import { github, githubUploads } from './services'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const startConnect = action('startConnect', {
  access: 'signedIn',
  input: { back: text({ optional: true }), account: text({ optional: true }) },
  output: text(),
  run: async ({ input }) => connections.start(github, { back: input.back, account: input.account }),
})

export const mine = query('mine', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: () => connections.list().map((one) => ({ service: one.service, account: one.account, scopes: one.scopes })),
})

export const issues = action('issues', {
  access: 'signedIn',
  input: { account: text({ optional: true }) },
  output: json(),
  run: async ({ input }) => github.listIssues({}, { account: input.account }),
})

export const upload = action('upload', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: async () => githubUploads.upload({}),
})

// Names the account of another user, with no full access.
export const issuesFor = action('issuesFor', {
  access: 'signedIn',
  input: { user: text() },
  output: json(),
  run: async ({ input }) => github.listIssues({}, { for: input.user }),
})

export const endConnect = action('endConnect', {
  access: 'signedIn',
  input: {},
  run: async () => connections.end(github),
})

// A run of the system that works through the account of one user.
export const nightly = flow('nightly', {
  output: json(),
  input: { user: text() },
  run: async ({ input, step }) => step('read', () => github.listIssues({}, { for: input.user })),
})
