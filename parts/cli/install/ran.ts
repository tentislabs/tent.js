import { spawnSync } from 'node:child_process'

/** Runs a program of the system, and answers whether it ended well and what it printed. */
export function ran(program: string, words: string[]): { ok: boolean; printed: string } {
  const done = spawnSync(program, words, { encoding: 'utf8', windowsHide: true })
  return { ok: done.status === 0, printed: done.stdout ?? '' }
}
