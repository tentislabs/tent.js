import { TentError } from '../../core/index.ts'
import type { Reached } from '../copy/reach.ts'
import type { Fetched } from './fetched.ts'
import type { Remote } from './remote.ts'

/** How a worker reaches the files of its writer for one task: what it fetches, and what it posts. */
export interface WorkerFiles {
  /** The value of a file that the writer made for a task, by its fingerprint: rows, or an answer past `inFrame`. */
  value(task: string, fingerprint: string): Promise<unknown>
  /** Posts a value too large for a frame for a task, with `carry`, and answers the id of its file. */
  carry(task: string, value: unknown): Promise<string>
  /** The rows of a task as the work is handed them: those that travelled as a file are fetched. */
  rows(task: Record<string, unknown>): Promise<Record<string, unknown>>
  /** The bytes of a file by its id, which the caller of a task may download. */
  bytes(task: string, id: string): Promise<Uint8Array>
  /** Posts the bytes of a file that the work of a task made, as a loose file of the starter of its run, and answers its id. */
  post(task: string, bytes: Uint8Array, kind?: string): Promise<string>
  /** Both of those for one task, as the work of the task is handed them. */
  of(task: string): Pick<Remote, 'bytes' | 'post'>
}

/** Takes what reaches the writer, its address and the key of the worker. Answers how the worker reaches the files of its tasks. */
export function workerFiles(
  reached: (address: string) => Reached,
  writer: () => string,
  key: string,
  fetched?: Fetched,
): WorkerFiles {
  const headers = { authorization: `Bearer ${key}` }
  const files: WorkerFiles = {
    async value(task, fingerprint) {
      const kept = fetched?.read(fingerprint)
      if (kept !== undefined) return JSON.parse(kept)
      const from = writer()
      const answer = await reached(from).request(
        new Request(`${from}/_t/work/file/${fingerprint}?task=${encodeURIComponent(task)}`, { headers }),
      )
      if (!answer.ok) throw new TentError('T5108', `The writer did not give the file ${fingerprint} of this task.`)
      const text = await answer.text()
      fetched?.keep(fingerprint, text)
      return JSON.parse(text)
    },
    async carry(task, value) {
      const from = writer()
      const answer = await reached(from).request(
        new Request(`${from}/_t/work/file?task=${encodeURIComponent(task)}&carry=1`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/octet-stream' },
          body: JSON.stringify(value ?? null),
        }),
      )
      const told = Object(await answer.json())
      if (told.ok !== true) throw new TentError(String(Object(told.error).code ?? 'T0009'), 'The writer took no file.')
      return String(Object(told.value).id)
    },
    async rows(task) {
      const rows: Record<string, unknown> = { ...Object(task.rows) }
      for (const [name, value] of Object.entries(rows)) {
        const file: unknown = Reflect.get(Object(value), 'file')
        if (typeof file === 'string' && !Array.isArray(value)) rows[name] = await files.value(String(task.id), file)
      }
      return rows
    },
    async bytes(task, id) {
      const from = writer()
      const answer = await reached(from).request(
        new Request(`${from}/_t/work/file/${encodeURIComponent(id)}?task=${encodeURIComponent(task)}`, { headers }),
      )
      if (!answer.ok) throw new TentError('T0001', `No file has the id ${id.slice(0, 60)} for this task.`)
      return new Uint8Array(await answer.arrayBuffer())
    },
    async post(task, bytes, kind) {
      const from = writer()
      const query = `task=${encodeURIComponent(task)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`
      const answer = await reached(from).request(
        new Request(`${from}/_t/work/file?${query}`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/octet-stream' },
          body: bytes.slice(),
        }),
      )
      const told = Object(await answer.json())
      if (told.ok !== true) throw new TentError(String(Object(told.error).code ?? 'T0009'), 'The writer took no file.')
      return String(Object(told.value).id)
    },
    of: (task) => ({ bytes: (id) => files.bytes(task, id), post: (bytes, kind) => files.post(task, bytes, kind) }),
  }
  return files
}
