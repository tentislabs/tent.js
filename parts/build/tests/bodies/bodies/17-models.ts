import { action, choice, text } from 'tentjs'
import { helper, painter, sendReceipt, sendWelcome, stripe, writer } from '../app/shop.ts'

export const models = action('models', {
  access: 'everyone',
  run: async ({ input, db }) => {
    const order = await db.orders.get(input.order)
    const reply = await writer.reply(`Thank the buyer of order ${order.id}`)
    const read = await writer.fill({ summary: text({ max: 200 }), mood: choice(['calm', 'angry']) }, input.message)
    const picture = await painter({ prompt: read.summary })
    const answer = await helper({ message: input.message })
    const welcome = read.mood == 'angry' ? await sendWelcome({ customer: order.customer }) : undefined
    const receipt = await sendReceipt({ order: order.id })
    const charge = await stripe.getCharge({ id: order.chargeId })
    const approved = await helper.approve(input.run, 'refund')
    const busy = [await sendWelcome.working({ customer: order.customer }), await sendReceipt.working({ order: order.id })]
    return { text: reply.text, mood: read.mood, picture: picture.picture, said: answer.text, welcome, sent: receipt.sent, paid: charge.paid, approved, busy }
  },
})
