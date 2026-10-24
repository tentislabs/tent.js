import { action, log } from 'tentjs'
import { addUser, sendReceipt, slack, stripe, writer } from '../app/shop.ts'

export const awaitOrder = action('awaitOrder', {
  access: 'staff',
  system: 'adds a user for a new buyer',
  run: async ({ input, db, call }) => {
    const user = call(addUser, { name: input.name })
    const charge = stripe.getCharge({ id: input.charge })
    const posted = await slack.postMessage({ channel: '#sales', text: `New buyer ${user.name}` })
    const receipt = input.fast ? await call(sendReceipt, { order: input.order }) : await sendReceipt({ order: input.order })
    const both = [log.info('between'), await stripe.createRefund({ charge: input.charge })]
    const count = (await db.system.orders.where({ status: 'open' }).all()).length
    const first = (await db.orders.where({ status: input.status }).first())?.id ?? (await db.orders.get('o1')).id
    const none = input.skip && (await writer.reply('never asked'))
    const some = input.skip || (await writer.reply('asked'))
    return { user: user.id, paid: (await charge).paid, posted: posted.ok, sent: receipt.sent, refund: both[1].id, count, first, none, some }
  },
})
