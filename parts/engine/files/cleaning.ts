import { heldBy } from '../held.ts'
import type { Opened } from '../opened.ts'
import type { TenantFiles } from './face.ts'
import { passOver } from './pass.ts'

const system = { kind: 'system' } as const
const meta = '_t_meta'
const key = 'clean'

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant, and its files. Notes a clean in
 * the shared file, as the number of the write that notes it: a clean changes no description, so no fingerprint
 * moves, and a file is behind by the number of its own last write. Then the pass is started, which brings each
 * such file up with what it holds retired dropped, by a write of a higher number.
 */
export function cleanFiles(o: Opened, tenantFiles: TenantFiles): void {
  // The write below takes the next number: every write of a file before it holds a lower one.
  const at = heldBy(o) + 1
  tenantFiles.sharedWrite((tx) => {
    const there = tx.read({ from: meta, one: 'get', id: key }, system) !== undefined
    if (there) tx.change(meta, key, { value: at }, system)
    else tx.add(meta, { key, value: at }, system)
  }, true)
  void passOver(o, tenantFiles).catch((error: unknown) => {
    if (!o.closed)
      tenantFiles.line('error', 'The pass over the data files of tenants ended early.', { error: String(error) })
  })
}
