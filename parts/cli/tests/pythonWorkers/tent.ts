import { project } from 'tentjs'

export const pyworkers = project('pyworkers', {
  title: 'Python on workers',
  python: { version: '3.15' },
  limits: { pythonStopAfter: '2 seconds' },
  workers: {
    gpu: { about: 'A machine with a graphics card' },
    spread: { about: 'A kind that hands a task to the worker that waited longest', loaded: 'no' },
  },
})
