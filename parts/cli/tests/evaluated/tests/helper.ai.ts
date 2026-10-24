import test from 'node:test'
import { evals, judge, testApp } from 'tentjs/test'
import { grader, helper } from '../functions'

// The model answers by its instructions: a good prompt counts the orders, a worse one says nothing of use.
test('the helper', async () => {
  const app = await testApp()
  app.fake('writer', (request) => {
    const asked = String(request.messages.find((one) => one.who === 'user')?.text ?? '')
    const last = request.messages.at(-1)
    const units = { tokensOut: 10, images: 2 }
    if (!String(request.instructions).includes('in full')) return { text: 'No.', units }
    if (last?.who === 'user') {
      if (asked.includes('Refund')) return { calls: [{ tool: 'refund', with: {} }], units }
      if (asked.includes('Add')) return { calls: [{ tool: 'addOrder', with: { item: 'tent' } }], units }
      return { calls: [{ tool: 'myOrders', with: {} }], units }
    }
    const answers = request.messages.filter((one) => one.who === 'tool')
    if (asked.includes('Add') && answers.length === 1) return { calls: [{ tool: 'myOrders', with: {} }], units }
    const rows = answers.at(-1)?.result
    return { text: `There are ${Array.isArray(rows) ? rows.length : 0} orders.`, units }
  })
  app.fake('grader', {
    reply: (request) => {
      // The judge is handed the task, the answer and the rule as JSON after its words.
      const told = String(request.messages.at(-1)?.text ?? '')
      const { answer } = JSON.parse(told.slice(told.indexOf('{')))
      return { value: String(answer).includes('orders') ? { score: 0.9, why: 'It counts them.' } : { score: 0.2, why: 'It does not.' } }
    },
  })
  const maya = await app.user({ name: 'Maya', roles: [] })
  await evals(
    app,
    helper,
    [
      { name: 'adds', say: 'Add an order', expect: [{ called: 'addOrder', text: 'There are 1 orders.' }] },
      { name: 'refunds', say: 'Refund me', expect: { asked: 'refund', notCalled: 'refund' } },
      { name: 'judged', say: 'Summarise my orders', expect: judge(grader, 'Says how many orders there are') },
    ],
    { runs: 3, as: maya },
  )
  await app.close()
})
