import type { FileName } from '../data/index.ts'
import { keptPage, layoutOf } from '../data/index.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { systemWrite, walkedTx } from './systemWrite.ts'
import { isStored } from '../core/internal.ts'

/** Whether a table of the file holds a kept column: of the shared file where no file is named, or of the tenants of a table. */
function keepsIn(o: Opened, file: FileName | undefined): boolean {
  return Object.values(o.description.tables).some((record) => {
    const columns = isStored(record.columns) ? record.columns : {}
    const by = typeof record.tenant === 'string' ? Reflect.get(Object(columns[record.tenant]), 'table') : undefined
    return by === file?.table && Object.values(columns).some((type) => isStored(type) && type.keeps !== undefined)
  })
}

/**
 * Takes what the engine holds of an app, on the writer, after the switch that made a kept column, and the file of
 * a tenant where it is one that is brought up, with how a write of it is let through while nothing else reads it.
 * Fills each kept column whose walk the file notes, by the one walk of a switch: a page to a write as the system,
 * each page with its note moved on in the same write, so a stop goes on from where it stood.
 */
export async function walkKept(
  o: Opened,
  file?: FileName,
  inside: <Answer>(work: () => Answer) => Answer = (work) => work(),
): Promise<void> {
  if (!keepsIn(o, file)) return
  const layouts = layoutOf(o.description)
  const size = Math.max(1, storedLimit(o.description, 'workPage'))
  for (;;) {
    const walked = await systemWrite(o, 'kept', (_db, cx, told) =>
      inside(() => {
        const tx = walkedTx(cx, file, 'A kept column')
        const wrote = keptPage(tx, layouts, size)
        for (const one of wrote ?? []) told(one)
        return wrote !== undefined
      }),
    )
    if (!walked) return
  }
}
