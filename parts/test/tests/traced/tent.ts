import { project, secret, setting, text } from 'tentjs'

// The shop whose every press, call, write, run, model call and service call is traced. Its stand-ins answer on this
// computer, which the app may reach only where it is listed. The test writes the share it keeps anew.
export const shop = project('shop', {
  title: 'Shop',
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
  settings: { otlpUrl: { type: text({ default: 'http://127.0.0.1:1' }) } },
  workers: { heavy: { about: 'A machine for heavy counting' } },
  trace: { share: 1, otlp: { url: setting('otlpUrl'), headers: { authorization: secret('OTLP_TOKEN') } } },
})
