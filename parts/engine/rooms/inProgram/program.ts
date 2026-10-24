import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { AppProgram, ProgramStart } from '../room.ts'

/**
 * Ends a program with every program it started: on Windows by the system's own command, by its number; on macOS
 * and Linux by its group, also once the program itself has ended, so that what it started does not outlive it.
 */
function endTree(child: ChildProcess): void {
  const { pid } = child
  if (pid === undefined) return
  const gone = child.exitCode !== null || child.signalCode !== null
  if (process.platform === 'win32') {
    // A program that has ended took what it started with it, where it held them in a job that ends with it.
    if (gone) return
    const ender = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    ender.on('error', () => child.kill())
    return
  }
  try {
    // The program leads a group of its own: every program it started stands in that group.
    process.kill(-pid, 'SIGKILL')
  } catch {
    if (!gone) child.kill('SIGKILL')
  }
}

/**
 * Takes what a program of the app is started with. Starts it as a program of its own, with no shell: the command
 * and its words as they were written, in its folder, with the environment it was handed and nothing else, and its
 * three streams open. Answers it: `ended` is kept with the number it ended with, and refused where it could not be
 * started. Throws where the runtime cannot start it at all.
 */
export function startedProgram(o: ProgramStart): AppProgram {
  const child = spawn(o.command, o.args, {
    cwd: o.folder,
    env: o.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    // On macOS and Linux it leads a group of its own, so that `end` reaches what it started.
    detached: process.platform !== 'win32',
  })
  const { stdin, stdout, stderr } = child
  const ended = new Promise<number | null>((done, failed) => {
    child.once('exit', (code) => done(code))
    child.once('error', failed)
  })
  // A program that could not be started is told by `ended` alone: who started it may not wait for it.
  ended.catch(() => undefined)
  return { stdin, stdout, stderr, ended, end: () => endTree(child) }
}
