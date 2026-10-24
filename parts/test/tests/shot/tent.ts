import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  // The host of the picture that lies inside this computer's own network: the test writes its port here.
  hosts: ['http://127.0.0.1:PICTURE_PORT'],
})
