import { get, json, post, secret, service } from 'tentjs'

// Each address of this file is written anew by the test, with the port of its stand-in provider.
export const github = service('github', {
  url: 'http://127.0.0.1:1',
  auth: {
    oauth: {
      authorizeUrl: 'http://127.0.0.1:1/authorize',
      tokenUrl: 'http://127.0.0.1:1/token',
      revokeUrl: 'http://127.0.0.1:1/revoke',
      clientId: secret('GITHUB_ID'),
      clientSecret: secret('GITHUB_SECRET'),
      scopes: ['repo', 'user'],
      extra: { prompt: 'consent' },
    },
  },
  calls: { listIssues: get('/issues', { input: {}, output: json() }) },
})

// A second host of the same provider, which uses the connection of the first.
export const githubUploads = service('githubUploads', {
  url: 'http://127.0.0.1:1',
  connection: 'github',
  auth: { oauth: {} },
  calls: { upload: post('/uploads', { input: {}, output: json() }) },
})
