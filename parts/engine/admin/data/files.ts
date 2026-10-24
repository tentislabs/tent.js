import type { Admin } from '../../admin.ts'

/**
 * `tent data files`: the directory of the data files of tenants, each with its table, its tenant, its layout,
 * its size, and whether it is open, behind, failed or unswept. `behind`, `unswept` and `due` narrow it, `stray` has
 * the upkeep done at once, `sweep` sweeps every file that is unswept, and `retry` tries a failed file again. An app
 * that keeps no file of a tenant answers no file.
 */
export const admin: Admin = {
  name: 'data files',
  async run(o, args) {
    if (!o.tenantFiles) return { files: [] }
    const { filesCommand } = await import('../../files/command.ts')
    return filesCommand(o, o.tenantFiles, args)
  },
}
