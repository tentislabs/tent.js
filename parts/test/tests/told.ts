import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { App } from '../../engine/index.ts'

/** One machine of a test that runs its machines over the network: where it is reached, and where its data lies. */
export interface ToldOf {
  name: string
  address: string
  folder: string
  // The app, where the machine runs in the program of the test: nothing for one that is a program of its own.
  app?: App
  // The file that its program writes what it does into, where it is a program of its own.
  out?: string
  // What the last try to open it in the program of the test was refused with.
  refused?: string
  // What its engine told whoever listens, where it runs in the program of the test: each with its moment.
  events?: string[]
}

/** Reads rows of a data file or of a log beside the engine that holds it, or says why it could not. */
function rowsOf(file: string, sql: string): string {
  if (!existsSync(file)) return 'no such file'
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      return JSON.stringify(db.prepare(sql).all())
    } finally {
      db.close()
    }
  } catch (error) {
    return `not read: ${String(error)}`
  }
}

/** The last lines of a text file, or that it is not there. */
function tailOf(file: string, lines: number): string {
  if (!existsSync(file)) return '    (no such file)'
  const all = readFileSync(file, 'utf8').trimEnd().split('\n')
  return all
    .slice(-lines)
    .map((line) => `    ${line}`)
    .join('\n')
}

/** Whether a program of that number runs on this computer. */
function runs(pid: unknown): boolean | string {
  if (typeof pid !== 'number') return 'no number'
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Reflect.get(Object(error), 'code') === 'EPERM'
  }
}

/** Asks an address whether its app is ready, and says what it answered, or how the asking failed. */
async function asked(address: string): Promise<string> {
  try {
    const answer = await fetch(`${address}/_t/health`, { signal: AbortSignal.timeout(3000) })
    const body = (await answer.text()).slice(0, 200)
    return `status ${answer.status}, Tent-At ${answer.headers.get('tent-at')}, ${body}`
  } catch (error) {
    const cause: unknown = Reflect.get(Object(error), 'cause')
    return `no answer: ${String(error)} ${String(Reflect.get(Object(cause), 'code') ?? cause ?? '')}`
  }
}

/**
 * Takes the machines of a test. Answers, as text, what each of them holds and says at this moment: its role and
 * its number as its app answers them, what `engine.json` and `_t_here` hold, whether the program that
 * `engine.json` names still runs, the last lines of its log and of what its program wrote out, and what answers
 * at its address. A test says it where one of its waits runs out, so that a run on another computer tells why.
 */
export async function toldOf(machines: ToldOf[]): Promise<string> {
  const said: string[] = []
  for (const one of machines) {
    said.push(`machine ${one.name}, at ${one.address}`)
    if (one.app) {
      try {
        said.push(`  in the program of the test: role ${one.app.role}, at ${JSON.stringify(one.app.at())}`)
        said.push(`  the machines it knows: ${JSON.stringify(one.app.machines())}`)
      } catch (error) {
        said.push(`  in the program of the test, and its app does not answer: ${String(error)}`)
      }
    } else said.push('  not open in the program of the test')
    if (one.refused) said.push(`  the last try to open it here was refused: ${one.refused}`)
    if (one.events?.length)
      said.push(
        `  what its engine told, the last of it:\n${one.events
          .slice(-20)
          .map((line) => `    ${line}`)
          .join('\n')}`,
      )
    const file = join(one.folder, 'engine.json')
    if (existsSync(file)) {
      const held: Record<string, unknown> = Object(JSON.parse(readFileSync(file, 'utf8')))
      // The token opens the admin channel of that engine: it is left out of what a run prints.
      said.push(`  engine.json: ${JSON.stringify({ ...held, token: '...' })}, its program runs: ${runs(held.pid)}`)
    } else said.push('  engine.json: none')
    const data = join(one.folder, 'data.db')
    said.push(`  _t_here: ${rowsOf(data, 'SELECT "key", "value" FROM "_t_here"')}`)
    const meta = `SELECT "key", "value" FROM "_t_meta" WHERE "key" IN ('n', 'epoch', 'writer', 'version')`
    said.push(`  _t_meta: ${rowsOf(data, meta)}`)
    const log =
      'SELECT "at", "level", "message", "data" FROM (SELECT rowid, * FROM "lines" ORDER BY rowid DESC LIMIT 12) ORDER BY rowid'
    said.push(`  the last lines of its log: ${rowsOf(join(one.folder, 'logs.db'), log)}`)
    const calls =
      'SELECT "at", "name", "kind", "ok", "code" FROM (SELECT rowid, * FROM "calls" ORDER BY rowid DESC LIMIT 5) ORDER BY rowid'
    said.push(`  the last calls of its log: ${rowsOf(join(one.folder, 'logs.db'), calls)}`)
    if (one.out) said.push(`  what its program wrote out, the last lines:\n${tailOf(one.out, 25)}`)
    said.push(`  what answers at its address now: ${await asked(one.address)}`)
  }
  return said.join('\n')
}
