import { asset, boolean, choice, project } from 'tentjs'

export const tillwise = project('tillwise', {
  title: 'Tillwise',
  languages: ['en', 'tr'],
  currency: 'USD',
  icon: asset('icon.svg'),
  state: {
    mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' },
    videos: { type: boolean(), in: 'device' },
  },
  head: [{ script: { src: asset('mode.js') } }],
  unlock: { frames: ['https://www.youtube-nocookie.com'] },
})
