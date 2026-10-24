import { isStored } from '../../core/internal.ts'
import type { Message, ToolCall, Units } from '../face.ts'
import type { ReadFile } from './conversation.ts'

/** What a `model` step saves: its text, the tools it asked for, what the call used, and what the provider keeps. */
export interface ModelSaved {
  text: string
  calls: ToolCall[]
  used: { name: string; answeredBy: string; units: Units }
  keep?: unknown
  reasoning?: string
  // The reasoning would have passed `limits.result` of the agent, and was left out of what the step saves.
  reasoningLeftOut?: true
}

/** The units of a saved record, each a number. */
const unitsOf = (value: unknown): Units =>
  Object.fromEntries(
    Object.entries(isStored(value) ? value : {}).filter((one): one is [string, number] => typeof one[1] === 'number'),
  )

/** A `model` step's result as it was saved, read back: a step answers what it saved as plain data. */
export function modelSavedOf(value: unknown): ModelSaved {
  const saved: Record<string, unknown> = isStored(value) ? value : {}
  const used: Record<string, unknown> = isStored(saved.used) ? saved.used : {}
  const calls = (Array.isArray(saved.calls) ? saved.calls : []).filter(isStored).map((one) => ({
    id: String(one.id),
    tool: String(one.tool),
    input: one.input,
  }))
  return {
    text: typeof saved.text === 'string' ? saved.text : '',
    calls,
    used: { name: String(used.name ?? ''), answeredBy: String(used.answeredBy ?? ''), units: unitsOf(used.units) },
    ...(saved.keep === undefined ? {} : { keep: saved.keep }),
    ...(typeof saved.reasoning === 'string' ? { reasoning: saved.reasoning } : {}),
  }
}

/** The files of a read step as they were saved, read back. */
export function readFilesOf(value: unknown): ReadFile[] {
  const files: unknown = isStored(value) ? value.files : undefined
  return (Array.isArray(files) ? files : []).filter(isStored).map((one) => ({
    id: String(one.id),
    name: String(one.name),
    image: one.image === true,
    chars: typeof one.chars === 'number' ? one.chars : 0,
  }))
}

/** Whether what a branch of the tools of one answer gave is the message of a tool's answer. */
export const isMessage = (value: unknown): value is Message =>
  isStored(value) && (value.who === 'user' || value.who === 'assistant' || value.who === 'tool')
