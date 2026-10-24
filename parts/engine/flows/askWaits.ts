import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Runner, RunView } from '../../flows/index.ts'
import { madeText, readText } from '../mcp/texts.ts'
import { whoOf } from '../mcp/streams.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

// How often a call that waits for a run looks whether the run waits for a person.
const look = 50

const kind = 'run-ask'

/** The step of a run that waits for a person: an ask of an agent, or a wait of a flow that shows something. */
const askOf = (steps: RunView['steps']): RunView['steps'][number] | undefined =>
  steps.find((one) => one.state === 'waiting' && (one.ask !== undefined || one.show !== undefined))

/** The ask of a run that a text of the engine names, for one who: the run, its step and that step's repeat. */
export interface RunAsk {
  run: string
  step: string
  repeat: number
  who: string
}

/**
 * Takes an app, its runner, a run that a call of MCP waits for and the caller. Answers a promise that is refused
 * once the run waits for a person, with T7120 that carries the run and a text of the engine's own that names the
 * ask, for that caller: so the client may ask its person, or be pointed to the page. And what ends the looking.
 */
export function askWaited(
  o: Opened,
  runner: Runner,
  run: string,
  caller: Caller,
): { waited: Promise<never>; stop(): void } {
  let timer: NodeJS.Timeout | undefined
  const waited = new Promise<never>((_, refuse) => {
    timer = setInterval(() => {
      const view = runner.read(run)
      const step = view ? askOf(view.steps) : undefined
      if (!step) return
      clearInterval(timer)
      const ask: RunAsk = { run, step: step.name, repeat: step.repeat, who: whoOf(caller) }
      // The ask of a sequence lists the calls it is asked for, which the question of a chat app shows too.
      const listed: unknown = Reflect.get(Object(step.show), 'sequence')
      const more: unknown = Reflect.get(Object(step.show), 'more')
      const sequence: Record<string, string> = Array.isArray(listed)
        ? { sequence: JSON.stringify(listed), more: String(more === true) }
        : {}
      refuse(
        new TentError('T7120', `The run ${run} waits for the person's answer to ${step.name}.`, {
          fields: { ask: madeText(o, kind, { ...ask }), run, ...sequence },
          fix: 'Ask the person, and call the tool again with the answer; or call it with `{ run }` once they answered.',
        }),
      )
    }, look)
    timer.unref()
  })
  // The promise may be left unasked once the run ends first.
  waited.catch(() => undefined)
  return { waited, stop: () => clearInterval(timer) }
}

/**
 * Tells a run the answer to its ask that a text named, for the caller it was made for: a yes or a no, where the
 * ask still waits. Answers the run, which the call then waits for again. Throws T7120 for another caller.
 */
export function answeredRun(o: Opened, ask: RunAsk, caller: Caller, refused: boolean): string {
  if (ask.who !== whoOf(caller))
    throw new TentError('T7120', 'The ask of this run was made for another caller.', {
      fix: 'Answer the ask with the client of the person who started the run.',
    })
  answerAsk(o, ask, refused)
  return ask.run
}

/** Answers the ask of a run yes or no, where it still waits: one that was answered or ended is left as it is. */
export function answerAsk(o: Opened, ask: { run: string; step: string; repeat: number }, refused: boolean): void {
  const runner = o.flows?.runner
  const waits = runner
    ?.read(ask.run)
    ?.steps.some((one) => one.name === ask.step && one.repeat === ask.repeat && one.state === 'waiting')
  if (!runner || !waits) return
  if (refused) runner.refuse(ask.run, ask.step, undefined, { repeat: ask.repeat })
  else runner.approve(ask.run, ask.step, undefined, { repeat: ask.repeat })
}

/** The ask of a run that a text names, where the text is one of this engine and no older than `askTime`. */
export function runAskOf(o: Opened, text: string): RunAsk | undefined {
  const read = readText(o, kind, text, storedLimit(o.description, 'askTime'))
  if (!read || typeof read.run !== 'string' || typeof read.step !== 'string' || typeof read.who !== 'string')
    return undefined
  return { run: read.run, step: read.step, repeat: typeof read.repeat === 'number' ? read.repeat : 1, who: read.who }
}
