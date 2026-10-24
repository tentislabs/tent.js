import { project, anyone } from 'tentjs'

// The tests of media serve a site of their own beside the app, whose address they write in place of `SITE` before
// the build: that host is listed, and so is no other.
export const shop = project('shop', {
  title: 'Shop',
  hosts: ['SITE'],
  uploads: anyone('a visitor hands a photo in'),
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000, filesPerMinute: 100000 },
})
