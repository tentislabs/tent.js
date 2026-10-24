import { project } from 'tentjs'

export const smallBuilder = project('smallBuilder', {
  title: 'Small builder',
  languages: ['en'],
  // The apps of the workspaces live under names of this parent, and learn who calls them from its cookie.
  cookies: { domain: 'builder.localhost' },
  // The app of a project is shown beside the chat, in a frame of its own name.
  unlock: {
    frames: [
      'http://builder.localhost:*',
      'http://*.builder.localhost:*',
      'https://builder.localhost',
      'https://*.builder.localhost',
    ],
  },
})
