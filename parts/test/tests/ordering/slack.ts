import { post, secret, service, text } from 'tentjs'

// The address is written anew by the test, with the port of its stand-in server.
export const slack = service('slack', {
  url: 'http://127.0.0.1:1',
  auth: { bearer: secret('SLACK_TOKEN') },
  calls: { postMessage: post('/chat.postMessage', { input: { channel: text(), text: text() } }) },
})
