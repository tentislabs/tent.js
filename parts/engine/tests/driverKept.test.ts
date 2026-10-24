import assert from 'node:assert/strict'
import test from 'node:test'
import { agent, model, query, table, text } from '../../core/index.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { ReplyRequest } from '../../ai/index.ts'
import { driving } from './driving.ts'

test('[26-3] what a provider gives in keep comes back with the next request of the same run, and reaches no other model', async (t) => {
  const backup = model('backup', { provider: 'plain', name: 'b-1', abilities: ['reply', 'tools'], takes: 100_000 })
  const writer = model('writer', {
    provider: 'keeps',
    name: 'w-1',
    abilities: ['reply', 'tools'],
    takes: 100_000,
    fallback: [backup],
  })
  const orders = table('orders', { columns: { status: text() }, access: { read: 'anyone' } })
  const myOrders = query('myOrders', { about: 'The orders', access: 'anyone', input: {}, rows: orders.where({}) })
  const helper = agent('helper', {
    model: writer,
    instructions: 'You help.',
    tools: [myOrders],
    limits: { steps: 4, perRun: { tokensOut: 5000 } },
  })
  const toWriter: ReplyRequest[] = []
  const toBackup: ReplyRequest[] = []
  const d = driving(t, [backup, writer, orders, myOrders, helper], {
    providers: {
      keeps: {
        async *reply(request) {
          toWriter.push(request)
          if (toWriter.length === 1) {
            yield {
              end: {
                text: '',
                calls: [{ id: 'c1', tool: 'myOrders', input: {} }],
                keep: [{ thought: 'kept as it came' }],
              },
            }
            return
          }
          // The second round fails, and is given to the fall-back.
          const failure = new ProviderFailure('unreachable', 'gone')
          if (failure.kind === 'unreachable') throw failure
          yield { text: 'never' }
        },
      },
      plain: {
        async *reply(request) {
          toBackup.push(request)
          yield { end: { text: 'One order.', calls: [] } }
        },
      },
    },
    calls: { myOrders: () => [{ id: 'o1' }] },
  })
  const { answer } = await d.ran('helper', { message: 'Orders?' })
  assert.deepEqual(answer, { text: 'One order.' })
  const kept = (request: ReplyRequest | undefined): unknown =>
    request?.messages.find((one) => one.who === 'assistant')?.keep
  // The model that made it is handed it back unchanged with the next request of the run.
  assert.deepEqual(kept(toWriter[1]), [{ thought: 'kept as it came' }])
  // The model that answered in its place is handed none of it.
  assert.equal(toBackup.length, 1)
  assert.equal(kept(toBackup[0]), undefined)
  assert.deepEqual(toBackup[0].messages.find((one) => one.who === 'assistant')?.calls, [
    { id: 'c1', tool: 'myOrders', input: {} },
  ])
})
