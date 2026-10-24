import { project } from 'tentjs'

// A limit of a kind in a unit that no kind counts, and machine seconds for each caller.
export const shop = project('shop', {
  title: 'Shop',
  workers: {
    gpu: { limits: { perDay: { tokens: 100 }, perCallerPerDay: { machineSeconds: 60 } } },
  },
})
