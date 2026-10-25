// A stand-in for Claude Code in tests: it takes the words of `claude -p`, keeps a session of its own in the folder it
// runs in, and answers in Claude Code's streamed form, so no test reaches Anthropic. Its answers follow simple rules.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

const write = (message: object) => process.stdout.write(`${JSON.stringify(message)}\n`)

const readPrompt = async (): Promise<string> => {
  let text = ''
  for await (const part of process.stdin) text += part
  return text.trim()
}

interface Said {
  prompt: string
  answer: string
}

const sessionId = option('--resume') ?? option('--session-id') ?? 'none'
const folder = join(process.cwd(), '.fake-claude')
const sessionFile = join(folder, `${sessionId}.json`)
const allowed = (option('--allowedTools') ?? '').split(',').filter(Boolean)
const mcp = JSON.parse(option('--mcp-config') ?? '{"mcpServers":{}}')
const bridge = mcp.mcpServers?.bots

const callTool = async (name: string, input: object): Promise<string> => {
  const headers = { 'content-type': 'application/json', ...bridge.headers }
  await fetch(bridge.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
  })
  const answer = await fetch(bridge.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: input } }),
  })
  const body = await answer.json()
  return String(body.result?.content?.[0]?.text ?? '')
}

const finish = (
  o: {
    text: string
    tools?: { name: string; input: object; result: string; error?: boolean }[]
    denied?: { name: string; input: object }
    structured?: object
  },
  history: Said[],
  prompt: string,
) => {
  write({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: ['Bash', 'Read'] })
  let n = 0
  for (const tool of o.tools ?? []) {
    n++
    write({
      type: 'assistant',
      session_id: sessionId,
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: `t${n}`, name: tool.name, input: tool.input }] },
    })
    write({
      type: 'user',
      session_id: sessionId,
      parent_tool_use_id: null,
      message: {
        content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: tool.result, is_error: tool.error === true }],
      },
    })
  }
  const denials = []
  if (o.denied) {
    n++
    write({
      type: 'assistant',
      session_id: sessionId,
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: `t${n}`, name: o.denied.name, input: o.denied.input }] },
    })
    write({
      type: 'system',
      subtype: 'permission_denied',
      tool_name: o.denied.name,
      tool_use_id: `t${n}`,
      session_id: sessionId,
    })
    denials.push({ tool_name: o.denied.name, tool_use_id: `t${n}`, tool_input: o.denied.input })
  }
  write({ type: 'stream_event', session_id: sessionId, event: { type: 'message_start' } })
  const words = o.text.split(/(?<= )/)
  const third = Math.max(1, Math.ceil(words.length / 3))
  for (let i = 0; i < words.length; i += third)
    write({
      type: 'stream_event',
      session_id: sessionId,
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: words.slice(i, i + third).join('') } },
    })
  write({
    type: 'assistant',
    session_id: sessionId,
    parent_tool_use_id: null,
    message: { content: [{ type: 'text', text: o.text }] },
  })
  writeFileSync(sessionFile, JSON.stringify([...history, { prompt, answer: o.text }]))
  write({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    result: o.text,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    total_cost_usd: 0.004,
    permission_denials: denials,
    ...(o.structured ? { structured_output: o.structured } : {}),
  })
}

const choicesFor = (name: string): string[] => {
  const lower = name.toLowerCase()
  if (lower.includes('inbox') || lower.includes('mail'))
    return ['Sorting what comes in', 'Drafting my replies', 'A summary each morning', 'Following up on threads']
  if (lower.includes('calendar')) return ['Booking calls', 'Finding free times', 'A plan of my week', 'Reminders']
  return [`What ${name} does first`, 'A plan for the week', 'Checking in each morning', 'Something else']
}

const main = async () => {
  const prompt = await readPrompt()
  mkdirSync(folder, { recursive: true })
  const known = existsSync(sessionFile)
  if (option('--resume') && !known) {
    write({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: sessionId,
      result: `No conversation found with session ID: ${sessionId}`,
      usage: {},
      permission_denials: [],
    })
    return
  }
  const history: Said[] = known ? JSON.parse(readFileSync(sessionFile, 'utf8')) : []
  const lower = prompt.toLowerCase()

  if (option('--json-schema')) {
    const bots = [...prompt.matchAll(/^- ([^:]+): (.*)$/gm)].map((one) => ({
      name: one[1],
      brief: one[2].toLowerCase(),
    }))
    const asked = /asks: (.*)$/m.exec(prompt)?.[1] ?? prompt
    const tasks: { bot: string; task: string }[] = []
    const mailBot = bots.find((one) => one.brief.includes('mail'))
    const callBot = bots.find((one) => /call|meeting|calendar/.test(one.brief))
    if (/mail|summar/i.test(asked) && mailBot) tasks.push({ bot: mailBot.name, task: 'Summarise my mail.' })
    const call = /book a call with (\w+)/i.exec(asked)
    if (call && callBot) tasks.push({ bot: callBot.name, task: `Book a call with ${call[1]}.` })
    const say = tasks.length
      ? `I handed ${tasks.map((one) => `"${one.task}" to ${one.bot}`).join(' and ')}.`
      : 'No bot fits this yet. Which bot should take it?'
    return finish({ text: say, structured: { say, tasks } }, history, prompt)
  }

  if (lower.startsWith('you were just made')) {
    const name = /your name is ([^.]+)\./i.exec(prompt)?.[1] ?? 'your bot'
    const person = /greet (\S+) by name/i.exec(prompt)?.[1] ?? 'there'
    const choices = choicesFor(name)
    const text = [
      `Hi ${person}, I'm ${name}.`,
      '',
      '```question',
      'What should I focus on first?',
      ...choices.map((one, i) => `${'ABCD'[i]}. ${one}`),
      '```',
    ].join('\n')
    return finish({ text }, history, prompt)
  }

  if (lower.includes('said no to')) return finish({ text: 'I did not send it: nothing went out.' }, history, prompt)

  if (lower.includes('said yes to') && /sendinvite/i.test(prompt)) {
    const result = await callTool('sendInvite', {
      title: 'A call with Ada',
      with: ['ada@example.com'],
      at: '2026-10-23T10:00:00Z',
      minutes: 30,
    })
    return finish(
      {
        text: 'The invitation is sent: a call with Ada on Thursday at 10:00.',
        tools: [{ name: 'mcp__bots__sendInvite', input: { title: 'A call with Ada' }, result }],
      },
      history,
      prompt,
    )
  }

  if (/book a call|call with/i.test(prompt)) {
    const times = await callTool('calendar_findTimes', { with: ['ada@example.com'], day: '2026-10-23' })
    const input = { title: 'A call with Ada', with: ['ada@example.com'], at: '2026-10-23T10:00:00Z', minutes: 30 }
    const tools = [
      { name: 'mcp__bots__calendar_findTimes', input: { with: ['ada@example.com'], day: '2026-10-23' }, result: times },
    ]
    if (allowed.includes('mcp__bots__sendInvite')) {
      const result = await callTool('sendInvite', input)
      return finish(
        { text: 'The invitation is sent.', tools: [...tools, { name: 'mcp__bots__sendInvite', input, result }] },
        history,
        prompt,
      )
    }
    return finish(
      {
        text: 'Ada is free on Thursday at 10:00. I would send the invitation, once you say yes.',
        tools,
        denied: { name: 'mcp__bots__sendInvite', input },
      },
      history,
      prompt,
    )
  }

  if (/yesterday|what did you do/i.test(prompt)) {
    const done = history
      .filter((one) => !/^(you were just made|the person said)/i.test(one.prompt))
      .map((one) => `- ${one.prompt}`)
    const text = done.length
      ? `From my own memory, I did this:\n${done.join('\n')}`
      : 'I have nothing in my memory yet.'
    return finish({ text }, history, prompt)
  }

  if (/mail|summar/i.test(prompt)) {
    const found = await callTool('mailbox_searchMail', { words: 'this week' })
    return finish(
      {
        text: 'Your mail, in short:\n- Ada asks for a call this week.\n- The weekly news has three things.',
        tools: [{ name: 'mcp__bots__mailbox_searchMail', input: { words: 'this week' }, result: found }],
      },
      history,
      prompt,
    )
  }

  return finish(
    { text: `Here is my answer to "${prompt.slice(0, 200)}": it is written in three parts, as it arrives.` },
    history,
    prompt,
  )
}

await main()
