import { project } from 'tentjs'

// The project of sign-in for programs. A chat app of the tests serves its document from this computer, which
// `privateHosts` lets the engine reach. The builder states one client of its own, which may ask for the whole app.
export const shop = project('shop', {
  title: 'Shop',
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
  mcp: {
    clients: [
      {
        id: 'reports-app',
        name: 'Reports',
        redirects: ['http://127.0.0.1/callback', 'https://reports.example/back', 'reports:/done'],
        for: 'app',
      },
    ],
    scopes: { billing: ['addOrder'] },
  },
})
