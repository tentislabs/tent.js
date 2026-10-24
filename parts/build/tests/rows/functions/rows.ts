import { choice, connections, each, fail, flow, later, mail, settings, start, text, where } from 'tentjs'
import { addUser, bigOrder, calendar, encodeOne, helper, markPaid, ordersPage, sendWelcome, shop, stripe, videos, writer } from '../app'
import intro from '../prompts/intro.md'

const LABELS = { open: 'Open', paid: 'Paid' }

export const rows = flow('rows', {
  run: async ({ input, db, step, call, now }) => {
    const invoice = db.invoices.get(input.invoice)
    const { rows, next } = ordersPage(input.page)
    if (invoice) {
      fail('not-found', 'That order is not there.')
    } else {
      return
    }
    for (const line of rows) {
      await step.wait('3 days')
    }
    for (const line of rows) fail('no-lines', next)
    const questions = input.questions
    const i = input.at
    const marks = input.marks
    const places = [questions[i], LABELS[input.tab], rows?.[0], rows?.[i], marks['late'], marks?.['late'], marks['?late'], marks?.['?late']]
    const reads = [
      db.payments.where({ invoice: invoice.id }).first()?.amount,
      (await step('ask', () => writer.reply(intro))).text,
      where(rows, { paid: true }).length,
    ]
    const words = [later(now, '7 days'), each(rows, (l, i) => l.qty), each(rows, async (l) => l.qty)]
    await step('tell sales', () => mail.send({ to: input.to, subject: 'Sold', text: `Sold ${rows.length}` }))
    const calls = [
      markPaid({ order: invoice.id }),
      stripe.createRefund(input.refund),
      writer.reply(intro),
      helper.approve(input.ask),
      sendWelcome.working(input.run),
      call(addUser, input.user),
    ]
    const chains = [
      db.orders.where({ status: 'open' }).newest('placedAt').limit(input.limit).all(),
      db.system.orders.get(invoice.id),
      db.orders,
    ]
    const found = db.orders.where({ status: 'open' })
    const more = found.with('client').all()
    const news = videos.where({ state: 'new' })
    await step.many('encode', news.pick(['id']), encodeOne)
    const handed = [connections.start(calendar, { back: '/' }), start(bigOrder, { order: invoice.id })]
    const named = [
      shop.options.title,
      LABELS,
      intro,
      shop.options.languages[1],
      intro.length,
      shop.options.closed,
      settings.shopName,
    ]
    const typed = [writer.fill({ mood: choice(['calm', 'angry']) }, intro), writer.fill(text(), intro)]
    const marked = (input.count as number)! + (more.length satisfies number)
    return { order: invoice.id, customer: marked, places, reads, words, calls, chains, handed, named, typed }
  },
})

export const mailer = flow('mailer', {
  run: async () => {
    return shop.options.mail
  },
})
