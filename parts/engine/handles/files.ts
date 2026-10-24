import { callerText } from '../../data/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import type { HandleAsks } from '../handleCall.ts'
import { callOf } from '../handleCall.ts'
import { hasFullAccess } from '../full.ts'
import type { Opened } from '../opened.ts'
import { textOf } from '../readers/text.ts'
import { mayDownload } from '../stored/access.ts'
import type { StoredFile } from '../stored/files.ts'
import { bytesFor, fileRow, fileStore, forgetFile, putFile, streamOf, visitorOwner } from '../stored/files.ts'
import { signedUrlTo } from '../stored/signedUrls.ts'
import { table } from '../tables/files.ts'
import { visit } from '../visit.ts'
import { visitorNow, visitorOf } from '../visitor.ts'

const system = { kind: 'system' } as const

/**
 * The call that a member of the handle was used in. A member that answers a promise works where a call may wait,
 * and one that makes, removes or names the kind of a file does nothing in a call that only reads.
 */
const calling = (member: string, asks: HandleAsks = { waits: true }): CallContext => callOf(`\`files.${member}\``, asks)

/** The error of a file that is not there, or that is not this caller's to have: the two are told alike. */
const notFound = (id: unknown): TentError =>
  new TentError('T0001', `No file has the id ${(JSON.stringify(id) ?? 'nothing').slice(0, 60)}.`, {
    fix: 'Name the id of a file that this caller may download.',
  })

/** Answers the file of an id for the caller of a call, by the rule of a download. Code with full access reaches every file. Throws T0001. */
function theirs(o: Opened, cx: CallContext, id: unknown): StoredFile {
  const file = fileRow(o, id)
  const reached =
    file && file.removedAt === undefined && (hasFullAccess(cx) || mayDownload(o, cx.caller, file, visitorNow()))
  if (!file || !reached) throw notFound(id)
  return file
}

/** The range that code names, by its first and its last byte. */
function rangeOf(range: unknown): { from: number; to?: number } | undefined {
  const [from, to]: unknown[] = [Reflect.get(Object(range), 'from'), Reflect.get(Object(range), 'to')]
  if (typeof from !== 'number' && typeof to !== 'number') return undefined
  return { from: typeof from === 'number' ? from : 0, ...(typeof to === 'number' ? { to } : {}) }
}

/**
 * The working object behind the handle `files`. `put` makes a loose file of the caller, with the kind taken from
 * the bytes. `get`, `stream`, `info` and `text` hold to the rule of a download for the caller, `remove` removes a loose
 * file of the caller, `signedUrl` makes a signed address for a time to a file the caller may download, and
 * `setKind` is full access. Code with full access reaches every file.
 */
export const handle = (o: Opened): object => ({
  async put(content: unknown, how?: unknown): Promise<string> {
    const cx = calling('put', { waits: true, acts: true })
    const here = visit()
    // A caller who is nobody is told apart by a visitor id, where a browser is being answered.
    const nobody = cx.caller.kind === 'nobody' && cx.caller.visitor === undefined && here && !here.answered
    const [name, kind]: unknown[] = [Reflect.get(Object(how), 'name'), Reflect.get(Object(how), 'kind')]
    const bytes =
      content instanceof ReadableStream ? content : streamOf(content instanceof Uint8Array ? content : String(content))
    const file = await putFile(o, bytes, {
      name: typeof name === 'string' && name !== '' ? name : 'file',
      // A text that states no kind is plain text, where its bytes say nothing else.
      ...(typeof kind === 'string' ? { kind } : typeof content === 'string' ? { kind: 'text/plain' } : {}),
      by: nobody ? visitorOwner(visitorOf(here)) : callerText(cx.caller),
    })
    return file.id
  },
  async get(id: unknown, range?: unknown): Promise<Uint8Array> {
    const file = theirs(o, calling('get'), id)
    await bytesFor(o, file)
    const parts: Uint8Array[] = []
    for await (const part of fileStore(o).get(file.fingerprint, rangeOf(range))) parts.push(part)
    return new Uint8Array(Buffer.concat(parts))
  },
  stream(id: unknown, range?: unknown): ReadableStream<Uint8Array> {
    const file = theirs(o, calling('stream', {}), id)
    // The bytes are fetched where this machine lacks them, before the first part is read.
    const there = bytesFor(o, file).then(() => fileStore(o).get(file.fingerprint, rangeOf(range)).getReader())
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const part = await (await there).read()
        if (part.done) controller.close()
        else controller.enqueue(part.value)
      },
      cancel: async () => void (await there).cancel(),
    })
  },
  async info(id: unknown): Promise<object | undefined> {
    const cx = calling('info')
    let file: StoredFile
    try {
      file = theirs(o, cx, id)
    } catch {
      return undefined
    }
    return {
      name: file.name,
      kind: file.kind,
      size: file.size,
      ...(file.width === undefined ? {} : { width: file.width, height: file.height }),
    }
  },
  async text(id: unknown): Promise<string> {
    const cx = calling('text')
    const file = theirs(o, cx, id)
    return textOf(o, file)
  },
  async remove(id: unknown): Promise<void> {
    const cx = calling('remove', { waits: true, acts: true })
    const file = theirs(o, cx, id)
    // Only a loose file is removed: one that a row holds is the row's to let go of.
    if (file.looseAt === undefined) throw notFound(id)
    await forgetFile(o, file)
  },
  signedUrl(id: unknown, how?: unknown): string {
    const cx = calling('signedUrl', {})
    return signedUrlTo(o, theirs(o, cx, id), Reflect.get(Object(how), 'for'), callerText(cx.caller))
  },
  async setKind(id: unknown, kind: unknown): Promise<void> {
    const cx = calling('setKind', { waits: true, acts: true, full: 'states the kind of a file itself' })
    const file = theirs(o, cx, id)
    if (typeof kind !== 'string' || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(kind))
      throw new TentError('T0002', 'The kind of a file is written as `text/markdown`.', { fields: { kind: 'pattern' } })
    o.machine.writes('the kind of a file')
    o.store.write((tx) => tx.change(table.name, file.id, { kind }, system))
  },
})
