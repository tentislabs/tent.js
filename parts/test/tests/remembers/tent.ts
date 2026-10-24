import { project } from 'tentjs'

export const remembers = project('remembers', {
  title: 'Remembered answers',
  // A small room for remembered answers, so that a test sees the one given longest ago go first.
  limits: { remembered: '0.2 KB' },
  workers: {
    gpu: { about: 'Runs here while no worker is joined', orHere: true },
    cpu: { about: 'Another kind, that runs here too', orHere: true },
  },
})
