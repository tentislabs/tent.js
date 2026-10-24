import { callerText } from '../../data/index.ts'
import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import { noLink } from '../noLink.ts'
import type { Opened } from '../opened.ts'
import { mayDownload } from '../stored/access.ts'
import { fileRow, fileStore, forgetFile, putFile } from '../stored/files.ts'
import { okAnswer } from '../wire.ts'
import type { WorkerKey } from './keys.ts'
import type { Joined, OutTask } from './state.ts'

/** The task that a request names, where it is out to a worker of that key. */
function taskOf(o: Opened, key: WorkerKey, request: Request): { j: Joined; out: OutTask } | undefined {
  const task = new URL(request.url).searchParams.get('task')
  for (const j of o.work?.all.values() ?? []) {
    const out = task ? j.out.get(task) : undefined
    if (out && j.key.id === key.id) return { j, out }
  }
  return undefined
}

/** The bytes of the files that a worker posted for the tasks that are out to it, which the writer holds. */
function heldBy(o: Opened, j: Joined): number {
  let bytes = 0
  for (const out of j.out.values())
    for (const id of [...(out.posted ?? []), ...(out.carried ?? [])]) bytes += fileRow(o, id)?.size ?? 0
  return bytes
}

/** The caller of the run of a task, as the writer builds it from its starter. */
function callerOfTask(o: Opened, out: OutTask) {
  const run = out.steps[0] ? o.flows?.runner.read(out.steps[0].run) : undefined
  return run && o.work ? o.work.callerOfRun(run) : undefined
}

/**
 * `GET /_t/work/file/...`: a file that the task names by its fingerprint, or by its id one that its caller may
 * download or that the engine keeps for the progress of its step.
 */
export async function fileOfTask(o: Opened, key: WorkerKey, request: Request): Promise<Response> {
  const found = taskOf(o, key, request)
  const asked = decodeURIComponent(new URL(request.url).pathname.slice('/_t/work/file/'.length))
  if (!found || !asked) throw noLink()
  let fingerprint: string | undefined
  if (/^[0-9a-f]{64}$/.test(asked)) fingerprint = found.out.files?.includes(asked) ? asked : undefined
  else {
    const file = fileRow(o, asked)
    const caller = callerOfTask(o, found.out)
    // A file that the engine keeps for the progress of the task's step is the task's, as one its caller may download.
    const kept = file?.removedAt === undefined && found.out.kept?.includes(asked) === true
    if (file && (kept || (caller && mayDownload(o, caller, file)))) fingerprint = file.fingerprint
  }
  if (!fingerprint) throw noLink()
  return new Response(fileStore(o).get(fingerprint), {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/**
 * `POST /_t/work/file?task=...`: takes the bytes of a file that the work of a task made, held to
 * `limits.workFileSize`, as a loose file of the starter of its run under a name of the engine's own; with `carry=1`,
 * a value too large for a frame, which belongs to the writer alone. Answers `{ id }`. T5108 for a task that is not
 * out to the worker of this key.
 */
export async function takeFile(o: Opened, key: WorkerKey, request: Request): Promise<Response> {
  const found = taskOf(o, key, request)
  if (!found) throw new TentError('T5108', 'The task that the file names is not out to this worker.')
  const params = new URL(request.url).searchParams
  const carry = params.get('carry') === '1'
  const kind = params.get('kind') ?? undefined
  const caller = callerOfTask(o, found.out)
  if (!request.body) throw new TentError('T0002', 'A file that a worker posts carries its bytes.')
  const tooMuch = (): TentError =>
    new TentError('T0005', 'This worker posted more files than `workHeld` lets the writer hold for it.', {
      fix: 'Post fewer or smaller files, or raise `workHeld` of the project.',
    })
  // What one worker posted and the writer still holds for its tasks is held to `limits.workHeld`, as the bytes
  // arrive: a file past what is left is stopped there, and not written whole first.
  const size = storedLimit(o.description, 'workFileSize')
  const left = storedLimit(o.description, 'workHeld') - heldBy(o, found.j)
  if (left <= 0) throw tooMuch()
  let made: Awaited<ReturnType<typeof putFile>>
  try {
    made = await putFile(o, request.body, {
      // The name a worker sends is no name of a file here: the engine names it.
      name: carry
        ? 'carried.json'
        : `made.${(kind ?? 'application/octet-stream').split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'}`,
      ...(kind ? { kind } : {}),
      by: carry || !caller ? 'system' : callerText(caller),
      most: Math.min(size, left),
    })
  } catch (error) {
    if (left < size && error instanceof TentError && error.code === 'T0003') throw tooMuch()
    throw error
  }
  // Two files that were posted at once may pass the bound together: the later one is let go of.
  if (heldBy(o, found.j) + made.size > storedLimit(o.description, 'workHeld')) {
    await forgetFile(o, made)
    throw tooMuch()
  }
  if (carry) found.out.carried = [...(found.out.carried ?? []), made.id]
  else found.out.posted = [...(found.out.posted ?? []), made.id]
  return okAnswer({ id: made.id })
}
