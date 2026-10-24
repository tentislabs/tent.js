import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  cli: { names: { file: 'fetch-file' } },
  describeTo: 'anyone',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
