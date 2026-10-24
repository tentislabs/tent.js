// Runs the person's own Claude Code once without a window, `claude -p` with its streamed output, and reads the stream.
// The form of the stream is Claude Code's own, as sources.txt beside it names.
import { spawn } from 'node:child_process'

export interface ToolUse {
  id: string
  name: string
  input: unknown
  result?: string
  error?: boolean
}

export interface Denial {
  tool: string
  id: string
  input: unknown
}

export interface Turn {
  text: string
  session: string
  tools: ToolUse[]
  denials: Denial[]
  units: { tokensIn: number; tokensOut: number }
  cost: number
  failed?: string
  structured?: unknown
}

// The program is `claude` on the path, or the words of BOTS_CLAUDE as a JSON list, which a test points at its fake.
export const claudeProgram = (): string[] => {
  const named = process.env.BOTS_CLAUDE
  if (!named) return ['claude']
  const words: unknown = JSON.parse(named)
  if (!Array.isArray(words) || words.length === 0 || !words.every((one) => typeof one === 'string'))
    throw new Error('BOTS_CLAUDE is no JSON list of words.')
  return words
}

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : '')).join('')
}

export const runClaude = (o: {
  args: string[]
  prompt: string
  cwd: string
  signal: AbortSignal
  onText: (soFar: string) => void
}): Promise<Turn> =>
  new Promise((done, failed) => {
    const [program, ...first] = claudeProgram()
    const child = spawn(program, [...first, ...o.args], {
      cwd: o.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: o.signal,
      windowsHide: true,
      env: { ...process.env, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '60000' },
    })
    const turn: Turn = { text: '', session: '', tools: [], denials: [], units: { tokensIn: 0, tokensOut: 0 }, cost: 0 }
    let streamed = ''
    let rest = ''
    let errors = ''
    let ended = false
    const read = (line: string) => {
      if (!line.trim()) return
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      if (typeof message.session_id === 'string' && message.session_id) turn.session = message.session_id
      const event = Object(message.event)
      if (
        message.type === 'stream_event' &&
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        streamed += String(event.delta.text ?? '')
        o.onText(streamed)
      }
      if (message.type === 'stream_event' && event.type === 'message_start' && streamed && !streamed.endsWith('\n\n'))
        streamed += '\n\n'
      if (message.type === 'assistant' && message.parent_tool_use_id == null) {
        for (const part of Object(message.message).content ?? []) {
          if (part?.type === 'tool_use')
            turn.tools.push({ id: String(part.id), name: String(part.name), input: part.input })
        }
      }
      if (message.type === 'user') {
        for (const part of Object(message.message).content ?? []) {
          if (part?.type !== 'tool_result') continue
          const use = turn.tools.find((one) => one.id === part.tool_use_id)
          if (use) {
            use.result = textOf(part.content).slice(0, 4000)
            use.error = part.is_error === true
          }
        }
      }
      if (message.type === 'result') {
        ended = true
        turn.text = typeof message.result === 'string' ? message.result : streamed
        const usage = Object(message.usage)
        turn.units = {
          tokensIn:
            Number(usage.input_tokens ?? 0) +
            Number(usage.cache_creation_input_tokens ?? 0) +
            Number(usage.cache_read_input_tokens ?? 0),
          tokensOut: Number(usage.output_tokens ?? 0),
        }
        turn.cost = Number(message.total_cost_usd ?? 0)
        turn.structured = message.structured_output
        for (const denial of Array.isArray(message.permission_denials) ? message.permission_denials : [])
          turn.denials.push({
            tool: String(denial.tool_name),
            id: String(denial.tool_use_id),
            input: denial.tool_input,
          })
        if (message.is_error === true) turn.failed = turn.text || String(message.subtype ?? 'error')
      }
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (part: string) => {
      rest += part
      const lines = rest.split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) read(line)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (part: string) => {
      errors = (errors + part).slice(-4000)
    })
    child.on('error', failed)
    child.on('close', (code) => {
      read(rest)
      if (!ended) return failed(new Error(`Claude Code ended with ${code} before its answer: ${errors.trim()}`))
      done(turn)
    })
    child.stdin.end(o.prompt)
  })
