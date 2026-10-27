import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { writeSync } from 'node:fs'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'

/** How one start of the program ended: the number it ended with, and all it printed. */
type Ended = { code: number | null; out: string }

/** What `runKilled` answers: the number of kills, the seed its moments were drawn from, and the end of each round. */
type Killed = { kills: number; seed: number; ended: Ended[] }

// The rounds in a row that may end before their kill. A program that never reaches its kill would be started for ever.
const again = 10

// The word a start that its round kills at a line is handed, with that line; the start after the kill is handed none.
const killedWord = 'TENT_KILLED_AT'

/**
 * Takes a line that a program prints for the run that kills it. Writes it at once, not when the program next gives
 * way. Where it is the line this start is killed at, the start stands still there until the kill, so it never ends by
 * itself before its kill, however slow the computer is; any other start goes on at once.
 */
export function killedAt(line: string): void {
  writeSync(
    1,
    `${line}
`,
  )
  if (process.env[killedWord] === line) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}

/** Whether this start of a program is the one its round kills at a line: a start that works on until it is killed. */
export const killedStart = (): boolean => process.env[killedWord] !== undefined

/** Answers a source of numbers from 0 up to 1 that gives the same numbers for the same seed. */
function drawer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

// Windows keeps, for each program, the number of the program that started it, also after that one has ended. The
// shell of the system reads a number on each line, ends every program that leads back to it, and answers a line.
const sweep = `
$ErrorActionPreference = 'SilentlyContinue'
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
  $from = @([int]$line)
  while ($from.Count) {
    $next = @()
    foreach ($one in $all) {
      if ($from -contains [int]$one.ParentProcessId) {
        Stop-Process -Id $one.ProcessId -Force
        $next += [int]$one.ProcessId
      }
    }
    $from = $next
  }
  [Console]::Out.WriteLine('swept')
}
`

/**
 * What ends the programs that a killed program started. Elsewhere than on Windows the program leads a group of its
 * own, and the group is killed. On Windows the system ends them only by a command of its own, which is started at
 * the first kill and kept until `close`.
 */
function sweeper(): { after(pid: number): Promise<void>; close(): void } {
  if (process.platform !== 'win32')
    return {
      after: async (pid) => {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // Nothing of the group is left.
        }
      },
      close: () => {},
    }
  let shell: ChildProcessWithoutNullStreams | undefined
  let answers: AsyncIterator<string> | undefined
  return {
    after: async (pid) => {
      shell ??= spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', sweep], { stdio: 'pipe' })
      answers ??= createInterface(shell.stdout)[Symbol.asyncIterator]()
      shell.stdin.write(`${pid}\n`)
      const { done } = await answers.next()
      if (done) throw new Error('the command that ends what a killed program started ended itself')
    },
    close: () => shell?.stdin.end(),
  }
}

/**
 * Starts the program once and waits for its end. With `when` it is killed when it prints that line, with `after`
 * that many milliseconds after its start, and with neither it ends by itself. A start that has done none of these
 * after `wait` milliseconds is ended.
 * The program itself is ended at once, and what it started right after it, by `sweep`. Answers how it ended,
 * whether the kill ended it, and whether it was ended for hanging.
 */
function once(
  file: string,
  args: string[],
  sweep: (pid: number) => Promise<void>,
  kill: { when?: string; after?: number; wait: number },
): Promise<Ended & { killed: boolean; hung: boolean }> {
  return new Promise((resolve, reject) => {
    const { [killedWord]: _, ...env } = process.env
    const program = spawn(process.execPath, [file, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: kill.when === undefined ? env : { ...env, [killedWord]: kill.when },
    })
    let out = ''
    let printed = ''
    let hung = false
    let asked = false
    const end = () => {
      asked = true
      program.kill('SIGKILL')
    }
    const timer = kill.after === undefined ? undefined : setTimeout(end, kill.after)
    // A start that has neither reached its kill nor ended by itself when its time is up is ended for hanging.
    const patience = setTimeout(() => {
      hung = !asked
      end()
    }, kill.wait)
    program.stdout.setEncoding('utf8').on('data', (text: string) => {
      out += text
      if (kill.when === undefined) return
      printed += text
      const lines = printed.split('\n')
      printed = lines.pop() ?? ''
      if (lines.some((line) => line.replace(/\r$/, '') === kill.when)) end()
    })
    program.stderr.setEncoding('utf8').on('data', (text: string) => {
      out += text
    })
    program.on('error', reject)
    // The system says by the signal whether the kill ended the program, or the program ended first by itself.
    let killed = false
    let swept = Promise.resolve()
    program.on('exit', (_code, signal) => {
      clearTimeout(timer)
      clearTimeout(patience)
      killed = signal === 'SIGKILL'
      if (killed && program.pid !== undefined) swept = sweep(program.pid)
      swept.catch(reject)
    })
    // What the program started may hold what it prints into open, so the end of that is waited for last.
    program.on('close', (code) => swept.then(() => resolve({ code, out, killed: killed && !hung, hung }), reject))
  })
}

/**
 * Kills a program at a chosen moment, again and again, and starts it again each time. Takes the file of the program,
 * which is started with the runtime as a program of its own, with `args`. One round: it is started; it is killed,
 * with every program it started, when it prints the line `when`, or where no `when` is given at a moment between 0
 * and `within` milliseconds that is drawn from `seed`; it is started again and ends by itself. A round in which the
 * program ended by itself before its kill is done again, its moment then drawn within the time that start took. Answers a promise of the number of kills, which is `times`,
 * the seed, and how the second start of each round ended. The seed is printed at the start, and drawn where none is
 * given. The promise is refused where neither `when` nor `within` is given, where the program cannot be started,
 * where it ended before its kill ten times in a row, and where a start has neither reached its kill nor ended by
 * itself after `wait` milliseconds, 60,000 where none is given: that start is then ended.
 */
export async function runKilled(
  file: string,
  options: { times: number; when?: string; within?: number; seed?: number; args?: string[]; wait?: number },
): Promise<Killed> {
  const { times, when, within, args = [], wait = 60_000 } = options
  if (when === undefined && within === undefined) throw new Error('runKilled is handed a line or a time to kill at')
  const seed = options.seed ?? Math.floor(Math.random() * 4294967296)
  console.log(`runKilled ${basename(file)}: seed ${seed}`)
  const draw = drawer(seed)
  const { after, close } = sweeper()
  const ended: Ended[] = []
  const hangs = (what: string, round: number) =>
    new Error(`${basename(file)} ${what} after ${wait} milliseconds, in round ${round + 1}, seed ${seed}: it was ended`)
  try {
    for (let round = 0; round < times; round++) {
      // A computer quicker than the one the moment was chosen for ends the work before most moments of `within`:
      // a start that ended by itself tells how long the work now takes.
      let span = within ?? 0
      for (let tries = 1; ; tries++) {
        const kill = when === undefined ? { after: draw() * span, wait } : { when, wait }
        const began = performance.now()
        const first = await once(file, args, after, kill)
        if (first.hung) throw hangs('had neither reached its kill nor ended by itself', round)
        if (first.killed) break
        span = Math.min(span, performance.now() - began)
        if (tries === again)
          throw new Error(
            `${basename(file)} ended before its kill ${again} times in a row, in round ${round + 1}, seed ${seed}`,
          )
      }
      const second = await once(file, args, after, { wait })
      if (second.hung) throw hangs('had not ended by itself after it was started again', round)
      ended.push({ code: second.code, out: second.out })
    }
  } finally {
    close()
  }
  return { kills: times, seed, ended }
}
