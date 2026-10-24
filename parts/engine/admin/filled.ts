import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'
import { failedOf, filledCounts, lookAgain } from '../fill/counts.ts'
import type { Within } from '../fill/places.ts'

/** The files of a tenant table that `--of <tenant id>` or `--all` names, or nothing for the open ones. */
function withinOf(args: object): Within {
  const of: unknown = Reflect.get(args, 'of')
  const all = Reflect.get(args, 'all') === true
  if (of !== undefined && typeof of !== 'string') throw badWord('of', 'the id of a tenant')
  if (of !== undefined && all) throw badWord('all', 'no word beside `--of`: one names a tenant, the other every one')
  return { ...(typeof of === 'string' ? { of } : {}), ...(all ? { all: true } : {}) }
}

/**
 * `tent filled`: every column that work fills, with the counts of its values. `--look` marks each row whose work would
 * be handed other values than it was, and `failed` lists the values of one `<table>.<column>` that failed, with
 * their errors. For a tenant table both look in the file of the tenant that `--of` names, or with
 * `--all` in every file, and else in the files that are open.
 */
export const admin: Admin = {
  name: 'filled',
  async run(o, args) {
    const within = withinOf(args)
    const failed: unknown = Reflect.get(args, 'failed')
    if (failed !== undefined) {
      if (typeof failed !== 'string' || !failed.includes('.')) throw badWord('failed', 'a <table>.<column>')
      return { failed: failedOf(o, failed, within) }
    }
    const marked = Reflect.get(args, 'look') === true ? { marked: lookAgain(o, within) } : {}
    return { ...marked, columns: filledCounts(o) }
  },
}
