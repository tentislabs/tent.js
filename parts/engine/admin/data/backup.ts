import type { Admin } from '../../admin.ts'
import { takeBackup } from '../../backups.ts'

/**
 * `tent data backup`: a backup of the data into `backups/` of the data folder, safe while the app runs. Answers
 * its file, the number of the last write it holds, and the rows that its test-restore counted.
 */
export const admin: Admin = {
  name: 'data backup',
  run: async (o, args) => takeBackup(o, Reflect.get(args, 'whole') === true ? { whole: true } : {}),
}
