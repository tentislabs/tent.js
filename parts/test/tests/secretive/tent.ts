import { project, secret } from 'tentjs'

// The project names one secret in a definition: the server that its mail is sent through.
export const shop = project('shop', {
  title: 'Shop',
  mail: { from: 'shop@example.com', send: secret('MAIL_SERVER') },
})
