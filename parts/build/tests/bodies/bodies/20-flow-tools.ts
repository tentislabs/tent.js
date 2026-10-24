import { event, flow, mail } from 'tentjs'
import { encodeOne, slack, videos, writer } from '../app/shop.ts'

export const flowTools = flow('flowTools', {
  run: async ({ input, step, db }) => {
    const at = await step.now()
    const open = await step('read open', () => db.orders.where({ status: 'open' }).all())
    const told = await step.all(open, async (order, i) => {
      const posted = await step('tell sales', () => slack.postMessage({ channel: '#sales', text: `${i + 1}. order ${order.id}` }), { tries: 2 })
      return posted.ok
    })
    const fastest = await step.first([() => step('ask writer', () => writer.reply('Sum up')), () => step.wait('1 minute', { name: 'give up' })])
    const paid = await step.waitFor(event('order.paid'), { where: { order: input.order }, timeout: input.patience })
    if (paid.timedOut) {
      const say = await step.waitFor('approval', { timeout: input.ask })
      if (!say.approved) await step.done({ ended: 'refused', at })
    }
    for (const order of open) {
      await step('mail', () => mail.send({ to: input.to, subject: `Order ${order.id}`, text: 'It is on its way.' }))
    }
    const news = videos.where({ state: 'new' })
    const encoded = await step.many('encode', news.pick(['id']).first(), encodeOne, { atOnce: 2 })
    const counted = await step.many('count', videos.count({ state: 'new' }), encodeOne)
    const sum = (await step('ask', () => writer.reply(`Sum up ${told.length} orders`))).text
    await step.wait('3 days')
    return { at, told, fastest: fastest?.text, encoded: encoded.done, counted: counted.done, sum, lucky: (await step.random()) < 0.5 }
  },
})
