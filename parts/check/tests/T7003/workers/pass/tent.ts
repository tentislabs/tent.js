import { project } from 'tentjs'

// A kind counted for the app as a whole with a limit for the day, and one counted by caller with one for each caller.
export const shop = project('shop', {
  title: 'Shop',
  workers: {
    gpu: { countBy: 'app', limits: { perDay: { workSeconds: 3600 } } },
    cpu: { limits: { perCallerPerDay: { workSeconds: 60 } } },
  },
})
