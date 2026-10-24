import { project } from 'tentjs'

export const counter = project('counter', {
  title: 'Counter',
  backups: { every: false },
  // The stand-in host of the news and the weather answers on this computer.
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
