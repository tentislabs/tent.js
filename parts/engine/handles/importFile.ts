import { TentError } from '../../core/index.ts'
import { callOf } from '../handleCall.ts'
import type { ImportAsked } from '../import/asRun.ts'
import { imported, startImport } from '../import/asRun.ts'
import { changeNamed } from '../import/named.ts'
import type { Opened } from '../opened.ts'
import { handle as filesOf } from './files.ts'
import { isStored } from '../../core/internal.ts'

/**
 * The working object behind `importFile`: it imports a file that the caller may download, each record through the
 * change that `with` names, as the caller of the call. It is a run of the kind `import`, which a page follows, and
 * whose answer is the counts and the loose file of the caller that lists the records it refused. It answers the run.
 */
export const handle = (o: Opened): object => ({
  async file(id: unknown, how: unknown): Promise<object> {
    const cx = callOf('`importFile`', { waits: true, acts: true })
    const files = filesOf(o)
    // The file is held to the rule of a download of the caller, as every member of `files` holds it.
    const info: unknown = await Reflect.apply(Reflect.get(files, 'info'), files, [id])
    if (info === undefined)
      throw new TentError('T0001', `No file has the id ${(JSON.stringify(id) ?? 'nothing').slice(0, 60)}.`, {
        fix: 'Name the id of a file that this caller may download.',
      })
    const given: Record<string, unknown> = isStored(how) ? how : {}
    const asked: ImportAsked = {
      file: String(id),
      change: changeNamed(o, Reflect.get(Object(given.with), 'definition')),
      map: isStored(given.map)
        ? Object.fromEntries(Object.entries(given.map).map(([from, to]) => [from, String(to)]))
        : {},
      ...(typeof given.language === 'string' ? { language: given.language } : {}),
      ...(given.dry === true ? { dry: true as const } : {}),
    }
    // An app that keeps no runs, as one whose code names `importFile` only where the build cannot see it, imports
    // in the call and answers the counts.
    return o.flows ? startImport(o, cx, asked) : imported(o, cx.caller, asked)
  },
})
