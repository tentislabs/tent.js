import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { lockedTool } from '../../connect/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import type { StandTool } from './outsideServer.ts'
import { outsideServer } from './outsideServer.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

type Message = ReplyRequest['messages'][number]

/** A tool of the stand-in, by its name, with an input of one text. */
const toolOf = (name: string): StandTool => ({
  name,
  description: `The tool ${name}`,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

/** A picture of one pixel, as a PNG. */
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * What the Messages API of Anthropic refuses in a conversation, as its own errors say it: the messages of one side in
 * a row are one message there, and one with nothing in it is left out. The first message is the person's and holds no
 * tool result; a tool result answers a call of the message right before it; every call of a message is answered in
 * the next one; and in a message the tool results come before anything else.
 */
function refusedBy(messages: Message[]): string[] {
  const turns: { role: string; blocks: { result?: string; call?: string }[] }[] = []
  for (const message of messages) {
    const role = message.who === 'assistant' ? 'assistant' : 'user'
    const blocks: { result?: string; call?: string }[] = []
    if (message.who === 'tool') blocks.push({ result: message.id ?? '' })
    else {
      for (const _ of message.images ?? []) blocks.push({})
      if (message.text) blocks.push({})
      for (const call of message.calls ?? []) blocks.push({ call: call.id })
    }
    if (!blocks.length) continue
    const last = turns.at(-1)
    if (last?.role === role) last.blocks.push(...blocks)
    else turns.push({ role, blocks })
  }
  const refused: string[] = []
  if (turns[0]?.role !== 'user') refused.push('messages.0: the first message is not of the person')
  for (const [n, turn] of turns.entries()) {
    const calls = (turns[n - 1]?.role === 'assistant' ? turns[n - 1].blocks : []).flatMap((one) => one.call ?? [])
    if (turn.role === 'user') {
      let other = false
      for (const [m, block] of turn.blocks.entries()) {
        if (block.result === undefined) other = true
        else if (!calls.includes(block.result))
          refused.push(`messages.${n}.content.${m}: a tool result with no call in the message before it`)
        else if (other) refused.push(`messages.${n}.content.${m}: a tool result after another block`)
      }
      for (const call of calls)
        if (!turn.blocks.some((one) => one.result === call)) refused.push(`messages.${n}: no result of ${call}`)
    } else if (turn.blocks.some((one) => one.call) && !turns[n + 1])
      refused.push(`messages.${n}: calls with no message after them`)
  }
  return refused
}

test('[27-9] a conversation sent again holds each call of a tool with its answer, by the rules of the provider: in the turn, after the turn failed once its tools were called, and with a picture among two calls', async (t) => {
  const board = await outsideServer(t, {
    tools: [toolOf('snap'), toolOf('listBoards')],
    answer: (name) =>
      name === 'snap'
        ? { content: [{ type: 'image', data: png, mimeType: 'image/png' }] }
        : { content: [{ type: 'text', text: 'two boards' }] },
  })
  const folder = copyOf(t, 'outsided')
  const services = join(folder, 'services.ts')
  writeFileSync(services, readFileSync(services, 'utf8').replaceAll('http://127.0.0.1:1', board.remote.origin))
  const tools = Object.fromEntries(
    board.tools.map((one) => [
      one.name,
      lockedTool({ name: one.name, about: one.description, schema: one.inputSchema }),
    ]),
  )
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify({ board: { tools } }, null, 2)}\n`)
  const app = await testApp({ folder, real: ['board'] })
  closing(t, () => app.close())

  const refused: string[] = []
  let asked = 0
  let failing = true
  // The first step of the first turn calls both tools at once, and every step of that turn after it fails; the
  // steps of the next turn answer in words.
  app.fake('seer', (request: ReplyRequest) => {
    refused.push(...refusedBy(request.messages))
    asked++
    if (!failing) return { text: 'Seen.' }
    if (asked > 1) throw new Error('the provider fell over')
    const named = (own: string): string => request.tools?.find((one) => one.name.startsWith(own))?.name ?? own
    return {
      calls: [
        { tool: named('board_snap'), with: {} },
        { tool: named('board_listBoards'), with: {} },
      ],
    }
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(ada).call('newChat', {})), 'id'))
  const first = notDropped(await app.start('rememberer', { message: 'Look.', thread: chat }, { as: ada }))
  await app.runs.wait(first.run).catch(() => undefined)
  assert.equal(app.runs.read(first.run)?.state, 'failed')
  failing = false
  const second = notDropped(await app.start('rememberer', { message: 'Again.', thread: chat }, { as: ada }))
  assert.equal(String(Object(await app.runs.wait(second.run)).text), 'Seen.')
  assert.deepEqual(refused, [])
})
