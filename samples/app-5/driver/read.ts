// What a step saved comes back as plain data; these read it back into the shapes the driver works with.
import type { Turn } from './claude.ts'

export type Stored = Record<string, unknown>
export const record = (value: unknown): Stored => (value && typeof value === 'object' ? Object(value) : {})
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export interface BotInfo {
  bot: { id: string; name: string; brief: string; model: string; kind: string; owner: string }
  apps: { id: string; name: string; command: string; address: string }[]
  skills: { name: string; about: string; body: string }[]
  others: { id: string; name: string; brief: string }[]
  person: { id: string; name: string }
  execution: string
}

export const botInfoOf = (value: unknown): BotInfo => {
  const info = record(value)
  const bot = record(info.bot)
  if (!bot.id) throw new Error('This run names no bot of the app.')
  return {
    bot: {
      id: textOf(bot.id),
      name: textOf(bot.name),
      brief: textOf(bot.brief),
      model: textOf(bot.model) || 'thinker',
      kind: textOf(bot.kind) || 'bot',
      owner: textOf(bot.owner),
    },
    apps: listOf(info.apps).map((one) => {
      const app = record(one)
      return { id: textOf(app.id), name: textOf(app.name), command: textOf(app.command), address: textOf(app.address) }
    }),
    skills: listOf(info.skills).map((one) => {
      const skill = record(one)
      return { name: textOf(skill.name), about: textOf(skill.about), body: textOf(skill.body) }
    }),
    others: listOf(info.others).map((one) => {
      const other = record(one)
      return { id: textOf(other.id), name: textOf(other.name), brief: textOf(other.brief) }
    }),
    person: { id: textOf(record(info.person).id), name: textOf(record(info.person).name) },
    execution: textOf(info.execution) || 'ask',
  }
}

export const turnOf = (value: unknown): Turn => {
  const turn = record(value)
  const units = record(turn.units)
  return {
    text: textOf(turn.text),
    session: textOf(turn.session),
    tools: listOf(turn.tools).map((one) => {
      const use = record(one)
      return {
        id: textOf(use.id),
        name: textOf(use.name),
        input: use.input,
        result: typeof use.result === 'string' ? use.result : undefined,
        error: use.error === true,
      }
    }),
    denials: listOf(turn.denials).map((one) => {
      const denial = record(one)
      return { tool: textOf(denial.tool), id: textOf(denial.id), input: denial.input }
    }),
    units: { tokensIn: Number(units.tokensIn ?? 0), tokensOut: Number(units.tokensOut ?? 0) },
    cost: Number(turn.cost ?? 0),
    failed: typeof turn.failed === 'string' ? turn.failed : undefined,
    structured: turn.structured,
  }
}
