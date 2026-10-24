import { number, project, secret, text } from 'tentjs'

export const valued = project('valued', {
  title: 'Valued',
  mail: { from: 'shop@example.com', send: secret('MAIL_SERVER') },
  settings: {
    shopName: { type: text({ default: 'The shop' }), public: true },
    maxItems: { type: number({ default: 5, min: 1 }) },
  },
})
