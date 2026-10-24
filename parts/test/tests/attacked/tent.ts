import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  redirects: [
    { from: '/go/:where', to: '/:where' },
    { from: '/all/*', to: '/*' },
  ],
})
