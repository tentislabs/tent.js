import type { FileName } from './fileName.ts'
import { isId } from './ids.ts'
import type { Store } from './store.ts'

const system = { kind: 'system' } as const

/**
 * Takes the shared file of an app, and what names the file of a tenant. Answers whether it names a tenant: its
 * id is written as an id is, and the shared file holds the row. A file that stands on the disk says nothing of it:
 * the file of a tenant whose row is gone stands until the engine has removed it, and is read and written for
 * nobody.
 */
export function isTenant(shared: Store, file: FileName): boolean {
  return isId(file.id) && shared.read({ from: file.table, one: 'get', id: file.id }, system).value !== undefined
}
