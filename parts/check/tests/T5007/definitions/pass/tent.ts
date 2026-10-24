import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  workers: {
    gpu: { limits: { perDay: { workSeconds: 3600, machineSeconds: 7200 }, perCallerPerDay: { workSeconds: 60 } } },
  },
})
