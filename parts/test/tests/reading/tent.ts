import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // A packed file is opened no further than this, which a test passes with a small file.
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, readSize: '1 MB' },
})
