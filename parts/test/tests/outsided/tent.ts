import { project } from 'tentjs'

// The project of the outside MCP servers. Their stand-ins answer on this computer, which the app may reach only
// where it is listed.
export const shop = project('shop', {
  title: 'Shop',
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
