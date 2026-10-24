import { event, flow, json, link, mail } from 'tentjs'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const ship = flow('ship', {
  input: { order: link('orders'), lines: json() },
  run: async ({ input, step, db }) => {
    await pause(1)
    const order = await step('find order', () => db.orders.get(input.order))
    await step.wait('1 hour', { name: 'cool down' })
    for (const line of input.lines as string[]) {
      await step('pack', () => line)
    }
    await Promise.all((input.lines as string[]).map((line) => step('label', () => line)))
    await step(`mail ${order?.id}`, () => mail.send({ to: 'a@example.com', subject: 'Sent', text: 'On its way.' }))
    await step.waitFor(event('order.paid'), { timeout: '1 day' })
    await tell(step)
    const rows = await db.sql`select 1`
    return step.done(rows)
  },
})

async function tell(step: (name: string, work: () => unknown) => Promise<unknown>) {
  await step('told', () => 1)
}
