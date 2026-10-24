import { applySteps, cleanSteps } from '../../../data/index.ts'
import type { Admin } from '../../admin.ts'

/**
 * `tent data clean`: drops what was retired, and nothing else: each retired table, and each retired column of a
 * table that is still used. Answers the steps it carried out in the shared file, inside one write. On an app that
 * keeps a data file for each tenant the clean reaches each file too: the shared file notes the number of the write
 * of the clean, every file whose last write is older is behind, and the pass brings each up with what it holds
 * retired dropped.
 */
export const admin: Admin = {
  name: 'data clean',
  async run(o) {
    const dropped = cleanSteps(o.store.layout())
    if (dropped.length) o.store.write((tx) => applySteps(tx, o.store, dropped), { steps: true })
    if (o.tenantFiles) (await import('../../files/cleaning.ts')).cleanFiles(o, o.tenantFiles)
    return { dropped }
  },
}
