import { asset, boolean, project } from 'tentjs'

export const site = project('site', {
  title: 'Site',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  state: { agreed: { type: boolean(), in: 'device' } },
  head: [
    { script: { src: asset('alive.js'), load: 'alive' } },
    { script: { src: asset('idle.js'), load: 'idle' } },
    { script: { src: asset('consented.js'), load: 'alive', consent: 'agreed' } },
  ],
})
