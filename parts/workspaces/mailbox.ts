import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Mailer } from '../engine/index.ts'
import { readLine } from './readLine.ts'

/** The file of the mail that the test side of a workspace would have sent, in its engine's folder. */
const fileOf = (data: string): string => join(data, 'mail.jsonl')

/**
 * The mailer of the test side of a workspace: each message is written as one line of `mail.jsonl` in its engine's
 * folder, with the time it was handed over, in place of being sent. An attached file is written by its name, its
 * kind and its size, and not its bytes.
 */
export function mailbox(data: string): Mailer {
  return {
    async send(message) {
      const { attach, ...rest } = message
      const line = {
        at: Date.now(),
        ...rest,
        ...(attach
          ? { attach: attach.map((one) => ({ name: one.name, kind: one.kind, size: one.bytes.length })) }
          : {}),
      }
      mkdirSync(dirname(fileOf(data)), { recursive: true })
      appendFileSync(fileOf(data), `${JSON.stringify(line)}\n`)
      return {}
    },
  }
}

/** What the test side of a workspace would have sent, oldest first, the newest `newest` of it where that is given. */
export function mailIn(data: string, newest?: number): object[] {
  if (!existsSync(fileOf(data))) return []
  const all = readFileSync(fileOf(data), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line): object[] => readLine(line))
  return newest === undefined ? all : all.slice(-newest)
}
