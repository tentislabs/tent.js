import { agent, choice, json, link, list, model, secret, table, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'owner' } })

export const chats = table('chats', { columns: { title: text({ optional: true }) }, access: { read: 'signedIn' } })

export const messages = table('messages', { columns: { chat: link('chats'), who: choice(['user', 'assistant', 'tool', 'summary']), text: text({ lines: 'many', optional: true }), data: json({ optional: true }), run: text({ optional: true }), by: link('users', { optional: true }) }, owner: 'by', access: { read: 'owner' } })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], memory: { in: messages, thread: 'chat' }, limits: { steps: 12, perRun: { tokensOut: 50000 } } })
