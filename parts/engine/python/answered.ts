import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { called } from '../door/call.ts'
import { callService, serviceCallOf } from '../services/call.ts'
import type { Opened } from '../opened.ts'
import { endedOf, pythonFailureOf } from './failures.ts'
import type { PythonProgram, PythonTold } from './program.ts'
import { lineOf, programsOf } from './programs.ts'
import type { Progress } from './progress.ts'
import { copyInFolder } from './values.ts'
import { gather } from '../counts/gather.ts'
import { childUsed } from '../counts/program.ts'

/** What one call hands its Python program, and what answers what the program asks for it. */
export interface PythonHanding {
  name: string
  record: Record<string, unknown>
  handed: Record<string, unknown>
  program: PythonProgram
  frame: Record<string, unknown> & { call: string; folder: string }
  progress: Progress | undefined
  // Carries a call that Python made one step deeper in calls of a `python`.
  deeper<T>(work: () => T): T
}

/** What a call answers Python with: its value, or its error with the number of the asking. */
function wireOf(error: unknown, ask: number): Record<string, unknown> {
  if (error instanceof TentError)
    return { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}), ask }
  return { code: 'T0009', message: 'The call failed.', ask }
}

/**
 * Takes an app, the call context of a call of a `python`, and what the call hands its program. Hands the call over
 * and answers what `run` answered: a call back through `tent.call` of a name that `uses` holds, as the caller of the
 * call and inside it; a copy of a file for `tent.file`; a kept progress. A line that `tent.log` sends is a line of
 * the log under the name of the definition, and what `tent.say` sends goes to whoever follows the run. Refused
 * with the error the caller is to see, and with T7119 where the program ended in the middle of the call.
 */
export function pythonAnswered(o: Opened, cx: CallContext, h: PythonHanding): Promise<unknown> {
  const { name, record, handed, program, frame } = h
  const { call } = frame
  const asked = new Map<number, unknown>()
  const uses = Array.isArray(record.uses) ? record.uses.map(String) : []
  const lines = programsOf(o).lines
  lines.set(call, lineOf(o, cx, name))
  program.calls.add(call)
  program.lastCall = call
  const refuse = (ask: number, error: unknown): void => {
    asked.set(ask, error)
    program.send({ t: 'answer', ask, error: wireOf(error, ask) })
  }
  const reply = (ask: number, work: () => Promise<unknown>): void => {
    work().then(
      (value) => {
        // An answer past the size of a frame is refused to Python with the words of its size.
        try {
          program.send({ t: 'answer', ask, value: value ?? null })
        } catch (error) {
          refuse(ask, error)
        }
      },
      (error: unknown) => refuse(ask, error),
    )
  }
  /** The work that answers one asking of Python. */
  const workOf = (told: PythonTold): (() => Promise<unknown>) => {
    if (told.what === 'call')
      return async () => {
        const target = String(told.name)
        if (!uses.includes(target))
          throw new TentError('T0013', `${name} called ${target} through tent.call, and \`uses\` does not name it.`, {
            fix: `Name ${target} in \`uses\` of ${name}.`,
          })
        // A service call is made as code makes it: by the engine, or on a worker where its kind lets it.
        const { remote } = cx
        if (serviceCallOf(cx, target) && !(remote && !remote.outside.services)) {
          if (!remote) return callService(cx, target, [told.input])
          return (await import('../work/outsideCall.ts')).calledOnWorker(cx, target, [told.input])
        }
        // On a worker any other call crosses to the writer, as every call of the work of a task does.
        if (remote) return remote.call(target, told.input)
        return h.deeper(() => called(o, target, told.input, { caller: cx.caller, parent: cx }))
      }
    if (told.what === 'file') return () => copyInFolder(o, cx, told.id, frame.folder)
    if (told.what === 'progress')
      return async () => {
        await h.progress?.keep(told.value, frame.folder)
        return null
      }
    return () => Promise.reject(new TentError('T0013', `Python asked for ${String(told.what)}, which is nothing.`))
  }
  return new Promise((done, failed) => {
    let stopTold = false
    const stopping: unknown = handed.stopping
    const watch =
      typeof stopping === 'function'
        ? setInterval(() => {
            if (!stopTold && stopping() === true) {
              stopTold = true
              program.send({ t: 'stop', call })
            }
          }, 500)
        : undefined
    watch?.unref()
    const finish = (): void => {
      clearInterval(watch)
      program.calls.delete(call)
      // What the program wrote of the call may come after it ended: its name is kept a little longer.
      setTimeout(() => lines.delete(call), 10_000).unref()
    }
    program.on(call, (told) => {
      if (told.t === 'ask') reply(Number(told.ask), workOf(told))
      else if (told.t === 'log') lineOf(o, cx, name)('info', String(told.message))
      else if (told.t === 'say') {
        const say: unknown = handed.say
        if (typeof say === 'function') say(told.value)
      } else if (told.t !== 'memory') {
        // The processor time of the call is counted under its name: what it said at its end, or, where it never
        // came to one, what the last reading said of it.
        const spent = told.t === 'ended' ? (program.reading.calls[call] ?? 0) : Number(told.cpuMs) || 0
        childUsed(spent)
        gather(o, name, { cpuMs: spent }, { caller: cx.caller })
        finish()
        if (told.t === 'done')
          done(
            Array.isArray(told.entries)
              ? told.entries.map((one) =>
                  Reflect.get(Object(one), 'kind') === undefined
                    ? Reflect.get(Object(one), 'value')
                    : pythonFailureOf(name, one, asked, handed),
                )
              : told.value,
          )
        else if (told.t === 'failed') failed(pythonFailureOf(name, told.error, asked, handed))
        else failed(endedOf(name, String(told.why ?? '')))
      }
    })
    // A call whose frame is past its size is refused with the words of its size, and the program goes on.
    try {
      program.send(frame)
    } catch (error) {
      finish()
      failed(error)
    }
  })
}
