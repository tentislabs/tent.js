// Loaded first into a program that a test starts: writes into the file that `TENT_TOLD` names, one record on each
// line, every module the program loads and every program of the system it runs, with what lay beside the path it
// handed that program. The answer of the program that `TENT_HOLD` names is held until the file `TENT_HOLD_UNTIL`
// is there, and with `TENT_RAISED` the account is answered as that of a program that was raised.
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { basename, dirname } from 'node:path'

const into = process.env.TENT_TOLD

/** Writes one record, with the moment it was written. */
function told(record: Record<string, unknown>): void {
  if (into) appendFileSync(into, `${JSON.stringify({ at: Date.now(), ...record })}\n`)
}

/** The words a program was handed, and the names that lay beside the first of them where it is a file. */
function handed(words: unknown): { args: string[]; beside: string[] } {
  const args = Array.isArray(words) ? words.map(String) : []
  const first = args[0]
  return { args, beside: first !== undefined && existsSync(first) ? readdirSync(dirname(first)) : [] }
}

/** What a program answered, with the level of the rights of a raised program where the test asks for it. */
const raisedIf = (program: string, out: unknown): unknown =>
  program === 'whoami.exe' && process.env.TENT_RAISED === 'yes' && typeof out === 'string'
    ? out.replace(/"S-1-16-\d+"/g, '"S-1-16-12288"')
    : out

/** Hands on the answer of a program, at once or once the test lets it go. */
function held(program: string, go: () => void): void {
  const until = process.env.TENT_HOLD_UNTIL
  if (program !== process.env.TENT_HOLD || until === undefined) {
    go()
    return
  }
  told({ kind: 'held', program })
  const looking = setInterval(() => {
    if (!existsSync(until)) return
    clearInterval(looking)
    go()
  }, 10)
}

registerHooks({
  load(url, context, next) {
    told({ kind: 'load', url })
    return next(url, context)
  },
})

// The code reads these from the runtime's own module when it is first run, which is after this file.
const programs = process.getBuiltinModule('node:child_process')
const execFile = programs.execFile
const execFileSync = programs.execFileSync
Reflect.set(programs, 'execFile', (file: string, ...rest: unknown[]) => {
  const program = basename(file).toLowerCase()
  told({ kind: 'ran', program, sync: false, ...handed(rest[0]) })
  const at = rest.findIndex((one) => typeof one === 'function')
  const answer = rest[at]
  if (typeof answer === 'function')
    rest[at] = (error: unknown, out: unknown, err: unknown) =>
      held(program, () => {
        told({ kind: 'answered', program })
        Reflect.apply(answer, undefined, [error, raisedIf(program, out), err])
      })
  return Reflect.apply(execFile, programs, [file, ...rest])
})
Reflect.set(programs, 'execFileSync', (file: string, ...rest: unknown[]) => {
  const program = basename(file).toLowerCase()
  told({ kind: 'ran', program, sync: true, ...handed(rest[0]) })
  return raisedIf(program, Reflect.apply(execFileSync, programs, [file, ...rest]))
})
syncBuiltinESMExports()
