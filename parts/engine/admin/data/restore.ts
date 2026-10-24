import { TentError } from '../../../core/index.ts'
import type { Admin } from '../../admin.ts'
import { badWord, wordOf } from '../../admin.ts'

/** Reads the moment of `--at`: a text as a date is written, or a number of milliseconds. Throws T0002 for any other. */
function momentOf(at: unknown): number {
  const moment = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : Number.NaN
  if (Number.isFinite(moment)) return moment
  throw new TentError('T0002', '`--at` takes a moment, as `2026-10-16T09:30:00Z` writes one.', {
    fields: { at: 'a moment' },
  })
}

/**
 * `tent data restore <file>`: puts the file of a backup back under the running app, with the table changes applied.
 * `--at <moment>` brings every data file to that moment, from a backup and the archive, and `--dry` says what it
 * would do and does nothing.
 */
export const admin: Admin = {
  name: 'data restore',
  async run(o, args) {
    const at: unknown = Reflect.get(args, 'at')
    if (at !== undefined) {
      const moment = momentOf(at)
      const dry = Reflect.get(args, 'dry') === true
      if (!dry) o.machine.writes('a restore')
      const { restoreAt } = await import('../../archived/restoreAt.ts')
      const said = await restoreAt(o, moment, { dry })
      return dry ? { dry: true, ...said } : { restored: new Date(moment).toISOString(), ...said }
    }
    const file = wordOf(args, 'file', 'the file of a backup')
    const of: unknown = Reflect.get(args, 'of')
    if (typeof of === 'string') {
      // One tenant of an app that keeps a data file for each is put back alone, by its id.
      if (!o.tenantFiles) throw badWord('of', 'nothing: this app keeps no data file for each tenant')
      o.machine.writes('a restore')
      await (await import('../../files/backups.ts')).restoreOne(o, o.tenantFiles, file, of)
      return { restored: file, of }
    }
    await o.app.restore(file)
    return { restored: file }
  },
}
