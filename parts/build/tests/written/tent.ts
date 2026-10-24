import { project, secret, text } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  languages: ['en', 'tr'],
  zone: 'Europe/Istanbul',
  settings: { supportEmail: { type: text({ default: 'help@example.com' }), public: true } },
  mail: { from: { name: 'The shop', address: 'shop@example.com' }, send: secret('SMTP_URL') },
  limits: { callSize: '2 MB', queryTime: '2 seconds', liveRows: 500, runsKept: '90 days' },
  redirects: [{ from: '/old/:id', to: '/orders/:id', permanent: false }],
  backups: { every: '12 hours', keep: 3 },
  history: { leave: ['*.log', 'tmp/'] },
  removed: ['oldOrders'],
})
