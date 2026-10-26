import type { Caller } from '../core/index.ts'
import type { CallDone, CallFacts } from '../engine/index.ts'
import { noteCalled } from '../engine/index.ts'

/** What a call that failed threw, as a failure of a test tells it: its code, its words, its fix and its place. */
interface Thrown {
  code: string
  message: string
  fix?: string
  where?: { file: string; line: number; definition?: string }
}

/** The facts of one call that a test made: whom as, with what, what it answered or threw, and what it did with the data. */
export interface TestCall extends CallFacts {
  name: string
  caller: Caller
  input: unknown
  answer?: unknown
  error?: Thrown
}

/** What a call threw, by the fields of its error. */
function thrownOf(error: unknown): Thrown {
  const fields = Object(error)
  const where: unknown = Reflect.get(fields, 'where')
  const fix: unknown = Reflect.get(fields, 'fix')
  return {
    code: String(Reflect.get(fields, 'code') ?? 'T0009'),
    message: String(Reflect.get(fields, 'message') ?? error),
    ...(typeof fix === 'string' ? { fix } : {}),
    ...(typeof where === 'object' && where !== null ? { where: Object(where) } : {}),
  }
}

/**
 * Takes a call that a test made, by its name, its caller and its input, and what it answered or threw with what it
 * did with the data. Answers its facts, which are kept as the newest call of the test that runs, so that a failure
 * of that test tells its last call.
 */
export function toldCall(name: string, caller: Caller, input: unknown, done: CallDone<unknown>): TestCall {
  const facts: TestCall = {
    name,
    caller,
    input,
    ...('error' in done ? { error: thrownOf(done.error) } : { answer: done.value }),
    ...(done.trace === undefined ? {} : { trace: done.trace }),
    read: done.read,
    wrote: done.wrote,
  }
  noteCalled(facts)
  return facts
}
