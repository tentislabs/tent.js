import { asset, project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  icon: asset('icon.svg'),
  unlock: { scripts: ['https://widgets.example.com'] },
  head: [
    { meta: { name: 'theme-color', content: '#123456' } },
    { link: { rel: 'preconnect', href: 'https://widgets.example.com' } },
  ],
})
