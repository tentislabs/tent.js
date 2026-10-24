import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Store, TableLayout } from '../index.ts'
import { sqliteStore } from '../index.ts'

/** The caller of a test that works as the system. */
export const system = { kind: 'system' } as const

// The stores that a test opened on each of its folders: each is closed before its folder is removed.
const stores = new Map<string, Store[]>()

/** Makes an empty folder for the data of one test, under the folder that git leaves out. It is removed when the test ends. */
export function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'data')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  stores.set(folder, [])
  t.after(() => {
    for (const store of stores.get(folder) ?? []) store.close()
    stores.delete(folder)
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return folder
}

/** Opens a store of the runtime's own SQLite on a folder of the test. It is closed when the test ends, where the test did not close it. */
export function opened(folder: string, o?: { readOnly?: boolean; lazy?: boolean }): Store {
  const store = sqliteStore()
  store.open(folder, o)
  let closed = false
  const close = store.close.bind(store)
  store.close = () => {
    if (!closed) close()
    closed = true
  }
  // A store that a test opens again, as a restore does, is closed once more when the test ends.
  const open = store.open.bind(store)
  store.open = (where, how) => {
    open(where, how)
    closed = false
  }
  stores.get(folder)?.push(store)
  return store
}

/** A table of a layout with what every layout states, and what the test adds. */
export const tableOf = (
  name: string,
  columns: TableLayout['columns'],
  more: Partial<TableLayout> = {},
): TableLayout => ({ name, columns, indexes: [], unique: [], search: [], ...more })

/** Makes the tables of a layout in a store, in one write. */
export function made(store: Store, tables: TableLayout[]): void {
  store.write(() => store.applyTableChanges(tables.map((layout) => ({ do: 'addTable', table: layout.name, layout }))))
}

/** Answers the code of what a call throws, or nothing where it throws no error with a code. */
export function codeOf(call: () => unknown): string | undefined {
  try {
    call()
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}
