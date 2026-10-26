import { request } from 'node:http'
import { action, text } from 'tentjs'
import { httpAt } from '../lib/at'

// A request of the code's own that leaves the program by `node:http`, and no plain fetch.
export const httpOut = action('httpOut', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () =>
    new Promise<string>((done) => {
      const asked = request(httpAt, (answer) => {
        answer.resume()
        done(String(answer.statusCode))
      })
      asked.on('error', () => done('refused'))
      asked.end()
    }),
})
