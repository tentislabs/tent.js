import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  workers: {
    gpu: { next: { kind: 'gpuBig', after: ['lost', 'memory'] } },
    gpuBig: {},
    near: { orHere: true, next: { kind: 'gpu', after: ['lost'] } },
    locked: { systemWork: false },
  },
})
