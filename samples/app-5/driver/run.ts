// The driver `claudeCode`: each run of a bot is turns of the person's own Claude Code in the bot's folder, its session
// resumed each time. A permission Claude Code was refused, and a question with lettered choices, are asks of the run.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiEnv } from 'tentjs/engine'
import type { Driver } from 'tentjs/flows'
import { openBridge } from './bridge.ts'
import { type Denial, runClaude, type Turn } from './claude.ts'
import { handOn, routing, routingShape } from './chief.ts'
import { questionWords, readQuestion } from './question.ts'
import { type BotInfo, botInfoOf, record, type Stored, turnOf } from './read.ts'
import { appToolsOf } from './tools.ts'

// The most turns one run takes, each after an answer of the person.
const mostTurns = 12

const ruleOf = (denial: Denial): string => {
  const input = record(denial.input)
  if ((denial.tool === 'Bash' || denial.tool === 'PowerShell') && typeof input.command === 'string')
    return `${denial.tool}(${input.command})`
  return denial.tool
}

const toolWords = (denial: Denial): string => {
  const input = record(denial.input)
  if (typeof input.command === 'string') return `${denial.tool}: ${input.command}`
  if (typeof input.file_path === 'string') return `${denial.tool}: ${input.file_path}`
  return denial.tool.replace(/^mcp__bots__/, '')
}

const mcpConfig = (info: BotInfo, bridge: { url: string; token: string } | undefined): string => {
  const servers: Record<string, object> = {}
  if (bridge) servers.bots = { type: 'http', url: bridge.url, headers: { Authorization: `Bearer ${bridge.token}` } }
  for (const app of info.apps) {
    const key = app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || app.id
    if (app.address) servers[key] = { type: 'http', url: app.address }
    else if (app.command) {
      const [command, ...args] = app.command.split(/\s+/).filter(Boolean)
      servers[key] = { type: 'stdio', command, args }
    }
  }
  return JSON.stringify({ mcpServers: servers })
}

const writeSkills = (folder: string, skills: BotInfo['skills']) => {
  const root = join(folder, '.claude', 'skills')
  mkdirSync(root, { recursive: true })
  for (const skill of skills) {
    mkdirSync(join(root, skill.name), { recursive: true })
    const head = `---\nname: ${skill.name}\ndescription: ${skill.about.replace(/\n/g, ' ')}\n---\n\n`
    writeFileSync(join(root, skill.name, 'SKILL.md'), head + skill.body)
  }
}

const readSkills = (folder: string): { name: string; about: string; body: string }[] => {
  const root = join(folder, '.claude', 'skills')
  if (!existsSync(root)) return []
  const found: { name: string; about: string; body: string }[] = []
  for (const name of readdirSync(root)) {
    const file = join(root, name, 'SKILL.md')
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || name.length > 64 || !existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    const head = /^---\n([\s\S]*?)\n---\n*/.exec(text)
    const about = head ? (/^description:\s*(.*)$/m.exec(head[1])?.[1] ?? '') : ''
    found.push({ name, about: about.slice(0, 1024), body: head ? text.slice(head[0].length) : text })
  }
  return found
}

const greeting = (info: BotInfo) =>
  [
    `You were just made. Your name is ${info.bot.name}.`,
    info.bot.brief
      ? `Your brief: ${info.bot.brief}`
      : 'You have no brief yet: it follows from what the person answers.',
    `Greet ${info.person.name || 'the person'} by name in one short line, and ask at once what you should focus on first,`,
    'with four choices that fit your name, as a question block.',
  ].join(' ')

const systemOf = (env: AiEnv, version: string, agentName: string, info: BotInfo) => {
  const agent = record(record(record(env.description(version).flows)[agentName]).agent)
  return [
    String(agent.instructions ?? ''),
    '',
    questionWords,
    '',
    `Your name: ${info.bot.name}.`,
    info.bot.brief ? `Your brief, from the person: ${info.bot.brief}` : 'You have no brief yet.',
    `The person you work for: ${info.person.name || 'the person'}.`,
    `Today is ${new Date(env.now()).toISOString().slice(0, 10)}.`,
  ].join('\n')
}

const modelName = (env: AiEnv, version: string, model: string): string => {
  const stored = record(record(env.description(version).models)[model])
  return typeof stored.name === 'string' ? stored.name : model === 'quick' ? 'haiku' : 'opus'
}

export const claudeCodeDriver =
  (dataFolder: string) =>
  (env: AiEnv): Driver =>
  async (run) => {
    const input = record(run.input)
    const botId = String(input.thread ?? '')
    const message = String(input.message ?? '')
    const call = (name: string, args: unknown) => Promise.resolve(env.call(name, [args]))
    const info = botInfoOf(await run.step('bot', () => call('botOfRun', { bot: botId })))
    const agentName = info.bot.kind === 'chief' ? 'chief' : 'bot'
    const folder = join(dataFolder, 'bots', botId)
    const by = run.top !== run.id ? 'chief' : run.starter.kind === 'user' ? 'person' : 'routine'
    await run.step('begin', async () => {
      mkdirSync(folder, { recursive: true })
      return call('noteTurn', { bot: botId, run: run.id, by, task: message, folder })
    })
    const end = (state: string, extra: Stored) => call('endTurn', { run: run.id, state, ...extra })
    try {
      await run.step('limit', async () => {
        await env.allow({ model: info.bot.model, call: 'reply', caller: run.starter, run: run.id })
        return call('dayLimitOf', { bot: botId })
      })
    } catch (error) {
      await run.step('refused', () =>
        end('failed', {
          error: { code: Object(error).code ?? 'failed', message: String(Object(error).message ?? error) },
        }),
      )
      throw error
    }
    if (message)
      await run.step('heard', () =>
        call('remember', { bot: botId, run: run.id, rows: [{ who: 'user', text: message }] }),
      )
    const chief = info.bot.kind === 'chief'
    let prompt = chief ? routing(info, message) : message || greeting(info)
    const allowed: string[] = []
    // Claude Code reports the tokens of each turn, and the cost of the whole session so far.
    const used = { tokensIn: 0, tokensOut: 0, cost: 0 }
    let answer = ''
    for (let n = 1; n <= mostTurns; n++) {
      const turn = turnOf(
        await run.step('turn', async (working) => {
          writeSkills(folder, info.skills)
          const tools = appToolsOf(env.description(run.version), agentName, call)
          const bridge = tools.length > 0 ? await openBridge(tools) : undefined
          const sessionFile = join(folder, '.session')
          const known = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim() : ''
          const session = known || randomUUID()
          const free = [
            ...tools.filter((one) => one.free).map((one) => `mcp__bots__${one.name}`),
            ...info.apps.map((app) => `mcp__${app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || app.id}`),
            ...(info.execution === 'always' ? ['Bash', 'PowerShell'] : []),
            ...allowed,
          ]
          const args = [
            '-p',
            '--output-format',
            'stream-json',
            '--verbose',
            '--include-partial-messages',
            '--model',
            modelName(env, run.version, info.bot.model),
            ...(known ? ['--resume', session] : ['--session-id', session]),
            '--append-system-prompt',
            systemOf(env, run.version, agentName, info),
            '--system-prompt-snapshot',
            'off',
            '--setting-sources',
            'project,local',
            '--mcp-config',
            mcpConfig(info, bridge),
            '--strict-mcp-config',
            '--permission-mode',
            'acceptEdits',
            ...(free.length > 0 ? ['--allowedTools', free.join(',')] : []),
            ...(info.execution === 'never' ? ['--disallowedTools', 'Bash,PowerShell'] : []),
            ...(chief ? ['--json-schema', JSON.stringify(routingShape)] : []),
          ]
          const started = env.now()
          let said = 0
          try {
            const done: Turn = await runClaude({
              args,
              prompt,
              cwd: folder,
              signal: run.signal,
              onText: (soFar) => {
                if (env.now() - said < 100) return
                said = env.now()
                working.say({ text: soFar })
              },
            })
            if (done.session) writeFileSync(sessionFile, done.session)
            working.say({ text: done.text })
            env.used({
              name: info.bot.model,
              answeredBy: info.bot.model,
              kind: 'reply',
              caller: run.starter,
              run: run.id,
              units: done.units,
              ms: env.now() - started,
              ok: !done.failed,
            })
            return done
          } finally {
            await bridge?.close()
          }
        }),
      )
      used.tokensIn += turn.units.tokensIn
      used.tokensOut += turn.units.tokensOut
      used.cost = turn.cost
      if (turn.failed) {
        await run.step('failed', () => end('failed', { error: { code: 'claude-code', message: turn.failed }, used }))
        throw new Error(`Claude Code failed: ${turn.failed}`)
      }
      if (chief) {
        answer = await handOn({ turn, info, run: run.id, step: run.step, call })
        break
      }
      const question = readQuestion(turn.text)
      answer = question ? question.before : turn.text
      await run.step('wrote', async () => {
        for (const skill of readSkills(folder)) await call('keepSkill', { bot: botId, ...skill })
        const rows: Stored[] = turn.tools.map((one) => ({
          who: 'tool',
          data: { id: one.id, tool: one.name, input: one.input, result: one.result, error: one.error },
        }))
        rows.push({
          who: 'assistant',
          text: answer,
          data: question ? { question: question.question, choices: question.choices } : undefined,
        })
        await call('remember', { bot: botId, run: run.id, rows })
        return call('endTurn', { run: run.id, state: 'running', answer, used })
      })
      const ask = `ask ${n}`
      if (question) {
        await run.step(`open ${ask}`, () =>
          call('openAsk', {
            bot: botId,
            run: run.id,
            step: ask,
            kind: 'question',
            question: question.question,
            choices: question.choices,
          }),
        )
        await run.step(`wait ${ask}`, () => end('waiting', {}))
        const answered = await run.step.waitFor(ask, { show: { kind: 'question', ...question } })
        const words = String(record(answered.data).answer ?? '')
        await run.step(`heard ${ask}`, async () => {
          await call('settleAsk', { run: run.id, step: ask, yes: answered.approved === true, answer: words })
          if (!info.bot.brief && !message && answered.approved && words)
            await call('fillBrief', { bot: botId, brief: `${question.question} ${words}` })
          await call('remember', {
            bot: botId,
            run: run.id,
            rows: [{ who: 'user', text: answered.approved && words ? words : 'Not now.' }],
          })
          return end('running', {})
        })
        prompt = answered.approved && words ? words : 'Not now: I would rather not choose yet.'
        continue
      }
      const denial = turn.denials[0]
      if (!denial) break
      await run.step(`open ${ask}`, () =>
        call('openAsk', {
          bot: botId,
          run: run.id,
          step: ask,
          kind: 'permission',
          tool: denial.tool.replace(/^mcp__bots__/, ''),
          input: denial.input,
          question: toolWords(denial),
        }),
      )
      await run.step(`wait ${ask}`, () => end('waiting', {}))
      const answered = await run.step.waitFor(ask, {
        show: { kind: 'permission', tool: denial.tool, input: denial.input },
      })
      await run.step(`heard ${ask}`, async () => {
        await call('settleAsk', { run: run.id, step: ask, yes: answered.approved === true })
        return end('running', {})
      })
      if (answered.approved) {
        allowed.push(ruleOf(denial))
        prompt = `The person said Yes to ${toolWords(denial)}. Do it now, as you meant to, and go on.`
      } else
        prompt = `The person said No to ${toolWords(denial)}. Do not do it, nor anything in its place; tell them in one line what is left undone.`
    }
    await run.step('end', () => end('done', { answer, used }))
    return { text: answer }
  }
