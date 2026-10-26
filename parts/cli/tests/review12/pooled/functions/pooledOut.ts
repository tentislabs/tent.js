import { Agent, request } from 'node:http'
import { action, text } from 'tentjs'
import { httpAt } from '../lib/at'

// One pool of connections for every call, which keeps a connection open for the next.
const pool = new Agent({ keepAlive: true, maxSockets: 1 })

export const pooledOut = action('pooledOut', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () =>
    new Promise<string>((done) => {
      const asked = request(`${httpAt}/pooled`, { agent: pool }, (answer) => {
        let said = ''
        answer.on('data', (part) => {
          said += String(part)
        })
        answer.on('end', () => done(said))
      })
      asked.on('error', () => done('refused'))
      asked.end()
    }),
})
