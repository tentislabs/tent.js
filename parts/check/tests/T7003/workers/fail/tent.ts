import { project } from 'tentjs'

// A kind of worker counted for the app as a whole, whose limit for each caller then bounds nothing.
export const shop = project('shop', {
  title: 'Shop',
  workers: { gpu: { countBy: 'app', limits: { perCallerPerDay: { workSeconds: 60 } } } },
})
