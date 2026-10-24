import { AsyncLocalStorage } from 'node:async_hooks'
import type { FileName } from '../../data/index.ts'

// The data files of tenants that the reads of the page under way opened, each as `<table>:<tenant>`.
const reading = new AsyncLocalStorage<Set<string>>()

/** Carries out the answer of a page, noting the data file of a tenant that each of its reads opened. */
export function readingFiles<Answer>(work: () => Answer): Answer {
  return reading.run(new Set(), work)
}

/** The data files of tenants that the reads of the page under way opened so far, or nothing outside a page. */
export const filesRead = (): string[] | undefined => {
  const files = reading.getStore()
  return files ? [...files] : undefined
}

/** Is told a read of a table and the data file of a tenant it opened, which the page under way notes. */
export function pageFileRead(table: string, file: FileName | undefined): void {
  if (file) reading.getStore()?.add(`${table}:${file.id}`)
}
