import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { One } from './state.ts'
import { readLine } from './readLine.ts'

/** The file beside the data of a workspace that holds what a project tool called of it that sends data out. */
const fileOf = (one: One): string => join(one.folders.root, 'sent.jsonl')

/** Writes down that a project tool called a function or a flow of the workspace that sends data out, and when. */
export function noteSent(one: One, name: string): void {
  appendFileSync(fileOf(one), `${JSON.stringify({ at: Date.now(), name })}\n`)
}

/** The names of what a project tool called that sends data out, from a moment on, each once, in order. */
export function sentSince(one: One, from: number): string[] {
  if (!existsSync(fileOf(one))) return []
  const names = readFileSync(fileOf(one), 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => readLine(line))
    .filter((one) => Number(Reflect.get(one, 'at')) >= from)
    .map((one) => String(Reflect.get(one, 'name')))
  return [...new Set(names)]
}
