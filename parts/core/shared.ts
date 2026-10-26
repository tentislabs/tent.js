import type { Caller } from './caller.ts'
import type { Finding } from './errors.ts'
import type { TestsTouched } from './tested.ts'
import type { Type } from './type.ts'

/** A function that takes nothing: it takes back what a clock was asked for. */
export type Cancel = () => void

/** The clock of an engine: the time, and a timer. */
export interface Clock {
  now(): number
  setTimer(at: number, fn: () => void): Cancel
}

/** What the check is told of a running app. */
export interface Facts {
  tableFindings: Finding[]
  waitingStepNames: Record<string, string[]>
  // What each test touched in its last run, where the tests of the project ran: with none, nothing is known of it.
  touched?: TestsTouched
}

/** A tool that is no definition, as its source tells it. */
export interface ToolSpec {
  name: string
  about: string
  input: Record<string, Type>
  danger?: 'ask'
  sends?: boolean
}

/** What gives a run tools in code. */
export interface ToolSource {
  tools(o: { run: string; starter: Caller; record: object; context: unknown }): ToolSpec[]
  call(o: {
    run: string
    starter: Caller
    record: object
    context: unknown
    tool: string
    input: unknown
    ask(what: object): Promise<boolean>
  }): Promise<unknown>
}
