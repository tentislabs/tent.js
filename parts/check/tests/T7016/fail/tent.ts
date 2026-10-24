import { project } from 'tentjs'

// The hold names a host, a program and a native module: the check notes each.
export const shop = project('shop', {
  title: 'Shop',
  hold: { net: ['api.example.com'], programs: ['ffmpeg'], native: ['sharp'] },
})
