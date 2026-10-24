import { secret, service } from 'tentjs'

// Each address of this file is written anew by the test, with the port of its stand-in; the program of `local` is
// named by the test too.
export const board = service('board', { url: 'http://127.0.0.1:1/mcp', mcp: true, auth: { bearer: secret('BOARD_KEY') } })

// A server that knows only the older form of the standard.
export const notes = service('notes', { url: 'http://127.0.0.1:2/mcp', mcp: true })

// A server whose tools are called with the connection of the run's user.
export const cloud = service('cloud', {
  url: 'http://127.0.0.1:3/mcp',
  mcp: true,
  auth: {
    oauth: {
      authorizeUrl: 'http://127.0.0.1:3/authorize',
      tokenUrl: 'http://127.0.0.1:3/token',
      clientId: secret('CLOUD_ID'),
      scopes: ['tools'],
    },
  },
})

// Two servers whose own documents say where they sign people in: one takes the app by its own document, the
// other only by registering.
export const wiki = service('wiki', { url: 'http://127.0.0.1:4/mcp', mcp: true, auth: { oauth: { discover: true } } })
export const team = service('team', { url: 'http://127.0.0.1:5/mcp', mcp: true, auth: { oauth: { discover: true } } })

// A server that is a program, which the engine starts.
export const local = service('local', { mcp: { command: ['PROGRAM'] } })
