// Ends a program that a driven browser or its driver was started as, whatever the program does.
import type { ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'

// How long a program is given after it was ended politely, and again after it was ended hard.
const turn = 5_000

const running = (program: ChildProcess): boolean => program.exitCode === null && program.signalCode === null

/** Answers once the program has ended, or after `within` milliseconds where it has not. */
const exitedWithin = (program: ChildProcess, within: number): Promise<void> =>
  new Promise((done) => {
    if (!running(program)) return done()
    const timer = setTimeout(done, within)
    program.once('exit', () => {
      clearTimeout(timer)
      done()
    })
  })

/**
 * Takes a program that was started, the folder it worked in, and how many milliseconds it is given to end by itself,
 * as one that was asked to close. Then it is ended, and five seconds later ended hard, which it cannot pass; it is
 * waited for five seconds more at most, so this answers whatever the program does. Its error stream is let go, and
 * its folder taken away.
 */
export async function endProgram(program: ChildProcess, folder: string, grace: number): Promise<void> {
  await exitedWithin(program, grace)
  if (running(program)) program.kill()
  await exitedWithin(program, turn)
  if (running(program)) program.kill('SIGKILL')
  await exitedWithin(program, turn)
  program.stderr?.destroy()
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  } catch {
    // What a helper program of the browser still holds is left in the folder of passing files of the system.
  }
}
