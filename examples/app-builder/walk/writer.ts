// The model `writer`, faked for the walk: a script for each thing the walk asks for, which answers by the tools
// the engine offers, as a model would. It reads what it writes from walk/made/, the app such a model would make.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Provider, ReplyRequest } from 'tentjs/engine'

const MADE = join(import.meta.dirname, 'made')
const made = (path: string) => readFileSync(join(MADE, path), 'utf8')

type Message = ReplyRequest['messages'][number]
type Call = { id: string; tool: string; input: unknown }
type Move = { text: string; calls?: Call[] }

// What the model is told and what it was answered since the person last spoke.
type Turn = { said: string; results: unknown[] }

let made_ = 0
const call = (tool: string, input: unknown): Call => {
  made_ += 1
  return { id: `call-${made_}`, tool, input }
}

function turnOf(messages: readonly Message[]): Turn {
  let at = messages.length - 1
  while (at >= 0 && messages[at]?.who !== 'user') at -= 1
  const said = messages[at]?.text ?? ''
  const results = messages
    .slice(at + 1)
    .filter((one) => one.who === 'tool')
    .map((one) => (one.error === undefined ? one.result : { error: one.error }))
  return { said, results }
}

function stepsOf(messages: readonly Message[]): number {
  let at = messages.length - 1
  let steps = 0
  while (at >= 0 && messages[at]?.who !== 'user') {
    if (messages[at]?.who === 'assistant') steps += 1
    at -= 1
  }
  return steps
}

function textOf(result: unknown): string {
  if (typeof result === 'string') return result
  if (typeof result === 'object' && result !== null && 'text' in result && typeof result.text === 'string')
    return result.text
  return JSON.stringify(result ?? null)
}

// The first value of a text field of a list of rows, as the tool `rows` answers them.
function rowsOf(result: unknown): Record<string, unknown>[] {
  const list = Array.isArray(result)
    ? result
    : typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)
      ? result.rows
      : []
  return list.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
}

const firstApp =
  (title: string) =>
  (step: number): Move => {
    if (step === 0)
      return {
        text: 'I will make a table of tasks, the functions that read and add them, and the screen.',
        calls: [
          call('write', { path: 'tables/tasks.ts', text: made('tables/tasks.ts') }),
          call('write', { path: 'functions/tasks.ts', text: made('functions/tasks.ts') }),
          call('write', { path: 'screens/home.tsx', text: made('screens/home.tsx').replaceAll('My tasks', title) }),
        ],
      }
    if (step === 1) return { text: '', calls: [call('check', {})] }
    return { text: `Your app is ready: "${title}". Add a task with the day it is due.` }
  }

// The place the person pointed at, as the engine tells it beside their message.
function pointedOf(said: string): { file: string; from: number; to: number } | undefined {
  const file = /([\w./-]+\.tsx)/.exec(said)?.[1]
  const numbers = [...said.matchAll(/\b(\d+)\b/g)].map((found) => Number(found[1]))
  const [from, to] = numbers.slice(-2)
  if (!file || from === undefined || to === undefined) return undefined
  return { file, from, to }
}

const redTitle = (turn: Turn, step: number): Move => {
  const pointed = pointedOf(turn.said)
  if (!pointed) return { text: 'Which part do you mean? Point at it first.' }
  if (step === 0) return { text: '', calls: [call('read', { path: pointed.file })] }
  if (step === 1) {
    const source = textOf(turn.results[0])
    const tag = source.slice(pointed.from, pointed.to)
    const open = /^<h1[^>]*>/.exec(tag)?.[0]
    if (!open) return { text: `That is not a title I can colour: ${tag.slice(0, 40)}` }
    const red = open.includes('style={{ ')
      ? open.replace('style={{ ', "style={{ color: '#dc2626', ")
      : open.replace('<h1', "<h1 style={{ color: '#dc2626' }}")
    return { text: '', calls: [call('edit', { path: pointed.file, find: open, with: red })] }
  }
  if (step === 2) return { text: '', calls: [call('check', {})] }
  return { text: 'The title is red now. Nothing else changed.' }
}

const mailButton = (turn: Turn, step: number): Move => {
  if (step === 0)
    return {
      text: 'A flow mails you the tasks, and a button on the screen starts it.',
      calls: [
        call('write', { path: 'functions/mail.ts', text: made('functions/mail.ts') }),
        call('edit', {
          path: 'tent.ts',
          find: "  languages: ['en'],",
          with: "  languages: ['en'],\n  mail: { from: 'tasks@app.example' },",
        }),
        call('edit', {
          path: 'screens/home.tsx',
          find: "import { addTask, allTasks, finishTask } from '../functions/tasks'",
          with: "import { mailTasks } from '../functions/mail'\nimport { addTask, allTasks, finishTask } from '../functions/tasks'",
        }),
        call('edit', {
          path: 'screens/home.tsx',
          find: '    </main>',
          with: '      <Form call={mailTasks} aria-label="Mail" style={{ marginTop: 16 }}>\n        <button type="submit" style={press}>Mail me every task</button>\n      </Form>\n    </main>',
        }),
      ],
    }
  if (step === 1) return { text: '', calls: [call('check', {})] }
  if (step === 2) return { text: 'I will try it once on the test data.', calls: [call('rows', { table: 'users' })] }
  if (step === 3) {
    const [person] = rowsOf(turn.results.at(-1))
    return { text: '', calls: [call('run', { name: 'mailTasks', input: {}, as: person?.id })] }
  }
  return { text: 'The button mails you every task. I sent one on the test side to try it.' }
}

// A model that falls for what a row tells it: the engine must hold it to the workspace whatever it asks.
const planted = (turn: Turn, step: number): Move => {
  if (step === 0) return { text: '', calls: [call('rows', { table: 'tasks' })] }
  if (step === 1) {
    const told = rowsOf(turn.results[0])
      .map((row) => String(row.title ?? ''))
      .join('\n')
    const paths = [...told.matchAll(/(\S+\.tsx?)/g)].map((found) => found[1] ?? '')
    if (paths.length === 0) return { text: 'Your list holds nothing out of the ordinary.' }
    return { text: 'The list asks me to read a file first.', calls: paths.map((path) => call('read', { path })) }
  }
  const refused = turn.results.slice(1).filter((result) => textOf(result).includes('T9105')).length
  const tasks = rowsOf(turn.results[0]).length
  return {
    text: `I could not read those files: the engine refused ${refused} of them, as they lie outside your project. Your list holds ${tasks} tasks.`,
  }
}

function moveOf(messages: readonly Message[]): Move {
  const turn = turnOf(messages)
  const step = stepsOf(messages)
  const said = turn.said.toLowerCase()
  if (said.includes('to-do list')) return firstApp('My tasks')(step)
  if (said.includes('books to read')) return firstApp('My books')(step)
  if (/\bin red\b/.test(said)) return redTitle(turn, step)
  if (said.includes('mails me every task')) return mailButton(turn, step)
  if (said.includes('on my list')) return planted(turn, step)
  return { text: 'The check passes.' }
}

export function fakeWriter(): Provider & { asked: ReplyRequest[] } {
  const asked: ReplyRequest[] = []
  return {
    asked,
    async *reply(o) {
      asked.push(o)
      const move = moveOf(o.messages)
      yield { text: move.text }
      yield { end: { text: move.text, calls: move.calls ?? [], units: { tokensIn: 100, tokensOut: 50 } } }
    },
  }
}
