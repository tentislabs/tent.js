import { action, text } from 'tentjs'
import { socketAt } from '../lib/at'

// A connection of the code's own to another host by the runtime's `WebSocket`, and no plain fetch.
export const socketOut = action('socketOut', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () =>
    new Promise<string>((done) => {
      const socket = new WebSocket(socketAt)
      socket.addEventListener('open', () => {
        socket.close()
        done('opened')
      })
      socket.addEventListener('error', () => done('refused'))
    }),
})
