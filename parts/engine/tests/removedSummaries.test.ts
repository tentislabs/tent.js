import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Provider } from '../index.ts'
import { addUser, running, send, system } from './apps.ts'

// A model that answers each turn, and a summary where one is asked for.
const mine: Provider = {
  async *reply(o) {
    const asked = o.messages.at(-1)?.text ?? ''
    const text = asked.includes('Turn') && !asked.startsWith('Turn') ? 'a summary' : 'Fine.'
    yield { end: { text, calls: [] } }
  },
}

test('[27-9] removing a person removes the summaries of their conversations', async (t) => {
  const run = await running(t, { project: 'summed', engine: { makers: { providers: () => ({ mine }) } } })
  const maya = await addUser(run.app, 'Maya')
  const chat = String(Reflect.get(Object(await run.app.call('newChat', {}, { as: maya })), 'id'))
  for (let turn = 1; turn <= 4; turn++)
    await run.app.call('agentOfChats', { message: `Turn ${turn}.`, thread: chat }, { as: maya })
  const rows = async (): Promise<string[]> => {
    const listed: unknown = await run.app.call('allMessages', {}, { as: system })
    return Array.isArray(listed) ? listed.map((one) => String(Reflect.get(Object(one), 'who'))) : []
  }
  assert.ok((await rows()).includes('summary'))
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/data`, {
    body: JSON.stringify({ args: { what: 'user', do: 'remove', id: String(maya.user?.id), yes: true } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  assert.deepEqual(await rows(), [])
})
