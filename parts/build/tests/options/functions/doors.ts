import { anyone, incoming, route } from 'tentjs'
import { nightly } from '../flows/tidy'
import { hooks } from '../services/hooks'

export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
  system: 'reads every note',
  origins: ['https://www.example.com'],
  limits: { time: '30 seconds', size: '1 MB' },
  was: 'rss',
})

export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  verify: hooks.signature,
  limits: { size: '4 MB' },
  was: 'events',
})

export const openEvents = incoming('openEvents', {
  path: '/hooks/open',
  then: nightly,
  open: 'the sender signs nothing',
})
