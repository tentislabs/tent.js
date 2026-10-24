import { project } from 'tentjs'

// A ring of kinds, a `next` with no cause, and one that names `'wait'` on a kind that never waits.
export const shop = project('shop', {
  title: 'Shop',
  workers: {
    gpu: { next: { kind: 'gpuBig', after: ['lost'] } },
    gpuBig: { next: { kind: 'gpu', after: ['lost'] } },
    cpu: { next: { kind: 'gpu', after: [] } },
    near: { orHere: true, next: { kind: 'gpu', after: ['wait'] } },
    locked: { systemWork: false },
  },
})
