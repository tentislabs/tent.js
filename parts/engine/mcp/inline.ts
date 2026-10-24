import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { mayDownload } from '../stored/access.ts'
import { fileRow, wholeBytes } from '../stored/files.ts'

// The size of a picture or a sound that travels inside an answer, where `mcp.inline` states none.
const inlineAtMost = 1_048_576

/**
 * The pictures and the sounds among files that an answer of a tool names, each of `mcp.inline` or less and one
 * that the caller may download, with its kind and its bytes: they travel inside the answer as well as by their ids.
 */
export async function inlined(
  o: Opened,
  ids: string[],
  caller: Caller,
): Promise<{ kind: string; bytes: Uint8Array }[]> {
  const stated: unknown = Reflect.get(Object(o.description.project.mcp), 'inline')
  const most = typeof stated === 'number' ? stated : inlineAtMost
  const found: { kind: string; bytes: Uint8Array }[] = []
  for (const id of new Set(ids)) {
    const file = fileRow(o, id)
    if (!file || file.size > most || !/^(image|audio)\//.test(file.kind) || !mayDownload(o, caller, file)) continue
    found.push({ kind: file.kind, bytes: await wholeBytes(o, file) })
  }
  return found
}
