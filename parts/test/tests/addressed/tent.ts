import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  redirects: [
    { from: '/old/:id', to: '/orders/:id' },
    { from: '/manual/*', to: '/docs/*', permanent: false },
    { from: '/away', to: 'https://help.example.com/start' },
  ],
})
