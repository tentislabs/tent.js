import { post, secret, service, text } from 'tentjs'

export const slack = service('slack', {
  url: 'https://slack.com/api',
  auth: { bearer: secret('SLACK_TOKEN') },
  calls: { postMessage: post('/chat.postMessage', { input: { channel: text(), text: text() } }) },
})
