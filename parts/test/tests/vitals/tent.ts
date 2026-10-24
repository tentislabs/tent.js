import { project, setting, text } from 'tentjs'

// Every page view is measured, and the measures are sent out beside the traces to a stand-in of the test.
export const shop = project('shop', {
  title: 'Shop',
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  settings: { otlpUrl: { type: text({ default: 'http://127.0.0.1:1' }) } },
  trace: { share: 1, otlp: { url: setting('otlpUrl') } },
  vitals: { share: 1 },
})
