import { project } from 'tentjs'

export const workedOut = project('workedOut', {
  title: 'Work that calls out',
  privateHosts: ['http://127.0.0.1'],
  workers: {
    gpu: { about: 'A machine that makes its own calls, with its own secrets' },
    cpu: { about: 'A machine that holds no secret: the writer makes its calls', outside: { services: 'writer' } },
  },
})
