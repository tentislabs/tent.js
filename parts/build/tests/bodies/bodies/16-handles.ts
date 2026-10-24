import { action, connections, files, later, log, mail, now, sessions, settings, concat } from 'tentjs'
import { calendar, shop } from '../app/shop.ts'

export const handles = action('handles', {
  access: 'everyone',
  run: async ({ input, user }) => {
    log.info('signing in', { user: user.id })
    const session = sessions.start(user.id, { for: '30 days' })
    const file = await files.put(`Hello ${settings.shopName}`, { name: 'hello.txt', kind: 'text/plain' })
    const address = connections.start(calendar, { back: input.back })
    await mail.send({ to: input.to, subject: concat('Welcome to ', settings.shopName), text: `Your file is ${file}, from ${shop.options.title}.` })
    return { session: session.id, file, address, soon: now() <= later(now(), '1 minute'), title: shop.options.title }
  },
})
