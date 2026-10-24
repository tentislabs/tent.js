import { service } from 'tentjs'

// The address is written anew by the test, with the port of its stand-in.
export const board = service('board', { url: 'http://127.0.0.1:1/mcp', mcp: true })
