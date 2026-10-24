import { project } from 'tentjs'

// The project of a screen in a chat. A chat app of the tests serves its page from this computer: the tests write its
// address in place of the listed site before the build, and its page calls `/mcp` from there.
export const shop = project('shop', {
  title: 'Shop',
  api: { origins: ['http://127.0.0.1:9'] },
  uploads: 'signedIn',
  // Two functions above a toolsListed of one: the chat app is listed the pair, and the screen calls each by its name.
  mcp: { toolsListed: 1 },
  limits: {
    anyonePerMinute: 100000,
    callerPerMinute: 100000,
    screensPerMinute: 100000,
    filesPerMinute: 100000,
    frameAsk: '2 seconds',
  },
})
