import { project } from 'tentjs'

export const heavy = project('heavy', {
  title: 'Heavy work',
  workers: {
    gpu: { about: 'A machine with a graphics card' },
    slow: { about: 'A kind that nothing joins as', wait: '1 minute' },
    narrow: { about: 'A kind that lets one call wait', wait: '1 minute', queue: 1 },
    oldest: { about: 'A kind that hands out the oldest first', order: 'oldest' },
    packed: { about: 'A kind that fills one worker first', place: 'pack', atOnce: 2 },
    spill: { about: 'A kind that goes on elsewhere', wait: '1 minute', next: { kind: 'gpu', after: ['wait'] } },
  },
})
