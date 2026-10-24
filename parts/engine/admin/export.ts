import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'

/**
 * `tent export`: takes the folder of a release bundle that the command built, makes it a loadable version, writes
 * the site out from it into `out`, and drops the version again, also where the export failed.
 */
export const admin: Admin = {
  name: 'export',
  async run(o, args) {
    const bundle = wordOf(args, 'bundle', 'the folder of a release bundle')
    const out = wordOf(args, 'out', 'the folder of the export')
    const read = (name: string): string | undefined => {
      const given: unknown = Reflect.get(args, name)
      return typeof given === 'string' ? given : undefined
    }
    const base = read('base')
    const origin = read('origin')
    const version = await o.app.add(bundle)
    try {
      return await o.app.export(out, {
        version,
        ...(base === undefined ? {} : { base }),
        ...(origin === undefined ? {} : { origin }),
        ...(read('names') === 'any' ? { names: 'any' as const } : {}),
      })
    } finally {
      if (version !== o.version) await o.app.drop(version)
    }
  },
}
