import { project, secret, text } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  languages: ['en', 'tr'],                       // the first is the default
  identify: undefined,                           // ({ request, about, db, call }) => user id: your own way of telling who is calling
  signInPath: '/sign-in',                        // where a visitor is sent when a screen needs a signed-in user
  zone: 'UTC',                                   // the time zone for schedules
  currency: 'USD',                               // what format="currency" shows money in
  settings: { supportEmail: { type: text({ default: 'help@example.com' }), public: true } },
  mail: { from: 'shop@example.com', send: secret('SMTP_URL') },
  limits: { /* call size, upload size, rate limits - 21-engine.md */ },
  removed: ['oldOrders'],                   // tables removed on purpose
})
