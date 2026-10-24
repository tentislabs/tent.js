import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext, Work } from '../context.ts'
import type { Address } from '../door/address.ts'
import { allows } from '../door/carry.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { countedFor } from '../door/rate.ts'
import { refusedBy, ruled } from '../door/rule.ts'
import { keyUploads } from '../keys/files.ts'
import { grantUploads } from '../grants/scoped.ts'
import { limitOf, storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { projectCode } from '../ownCode.ts'
import type { StoredFile } from '../stored/files.ts'
import { forgetFile, looseFiles, putFile, visitorOwner } from '../stored/files.ts'
import { misfit } from '../stored/holds.ts'
import type { UploadUnderway } from '../stored/resumed.ts'
import { beginUpload, directTaken, underwayBytes, uploadAt, uploadPart } from '../stored/resumed.ts'
import { visit } from '../visit.ts'
import { visitorOf } from '../visitor.ts'
import { countedAs } from '../web/names.ts'
import { errorAnswer, okAnswer } from '../wire.ts'

const name = 'upload'

const bad = (words: string, field: string, check: string): TentError =>
  new TentError('T0002', words, { fields: { [field]: check } })

/** Holds the name of an upload: it is kept as a name, and never used as a path. Throws T0002. */
function namedAs(given: string | null): string {
  // A control character, a slash and a backslash have no place in a name.
  const odd = (sign: string): boolean =>
    sign === '/' || sign === String.fromCharCode(92) || sign.charCodeAt(0) < 32 || sign.charCodeAt(0) === 127
  const fits = given !== null && given !== '' && given.length <= 255 && ![...given].some(odd)
  if (!fits)
    throw bad(
      'An upload states the name of its file in `name`: 255 characters at most, with no slash, no backslash and no control character.',
      'name',
      'pattern',
    )
  return given
}

/** The fields of the start of an agent that take a file. */
const startFiles = { files: { kind: 'list', of: { kind: 'file' } }, audio: { kind: 'file' } }

/**
 * The `file` field that an upload says it is meant for: `for` names a function of the running version that this
 * caller may call, or an agent, whose start takes `files` and `audio`, and `field` a `file` field of its input, by its dotted name, where a list of files means one
 * entry. Whatever does not fit is answered the same way, with T0002, so `for` tells nobody which functions an app
 * has.
 */
function fieldFor(o: Opened, caller: Caller, asked: URLSearchParams): Record<string, unknown> | undefined {
  const [fn, field] = [asked.get('for'), asked.get('field')]
  if (fn === null && field === null) return undefined
  const none = bad('`for` and `field` of an upload name no `file` field that this caller may send.', 'for', 'values')
  const record = fn !== null && Object.hasOwn(o.description.functions, fn) ? o.description.functions[fn] : undefined
  // An agent takes files at its start: the files that the message hands it, and a recording.
  const flow = fn !== null && Object.hasOwn(o.description.flows, fn) ? o.description.flows[fn] : undefined
  const started = flow?.agent !== undefined ? flow : undefined
  const access: unknown = record ? record.access : Reflect.get(Object(started?.agent), 'access')
  const input = record ? record.input : started ? startFiles : undefined
  if (!input || field === null) throw none
  // A rule made with `allow` cannot be asked before there is an input, and counts as letting the caller in here.
  if ('needs' in ruled(access, caller)) throw none
  let type: unknown = { kind: 'object', shape: input }
  for (const part of field.split('.')) {
    const shape: unknown = Reflect.get(Object(type), 'shape')
    type =
      typeof shape === 'object' && shape !== null && Object.hasOwn(shape, part) ? Reflect.get(shape, part) : undefined
    while (Reflect.get(Object(type), 'kind') === 'list') type = Reflect.get(Object(type), 'of')
  }
  if (Reflect.get(Object(type), 'kind') !== 'file') throw none
  return Object(type)
}

/** Asks the `uploads` rule of the project whether a caller may upload at all. Throws T0006 for nobody, and T3101 otherwise. */
function mayUpload(o: Opened, caller: Caller, stated: Record<string, unknown>): void {
  const access: Record<string, unknown> = Object(o.description.project.uploads ?? { rule: 'signedIn' })
  const said = ruled(access, caller)
  if ('needs' in said) throw refusedBy(name, said.needs, caller)
  if (said.says !== 'asks') return
  const work: Work = {
    name,
    kind: 'rule',
    depth: 1,
    now: new Date(o.clock.now()),
    ends: performance.now() + limitOf(o.description, 'queryTime'),
  }
  const cx: CallContext = { app: o, version: o.version, caller, made: 0, signal: new AbortController().signal, work }
  const arrow = projectCode(o, 'uploads')
  if (!allows(o, cx, { access, input: stated, ...(arrow ? { arrow } : {}) }))
    throw refusedBy(name, 'needs a caller that the `uploads` rule of the project lets in', caller)
}

/** One upload that is under way: who it belongs to, the address of a caller who is nobody, and its length. */
interface Arriving {
  by: string
  address?: string
  size: number
}

// The uploads of each app that are under way, kept under its handles: a file is a row only once its bytes are in.
const arriving = new WeakMap<object, Set<Arriving>>()

/**
 * The loose bytes that one owner holds now, and with an address those of a caller who is nobody behind it: the
 * files that stand, and the uploads that are under way at their stated length, those sent in parts among them,
 * so that uploads sent side by side are held to the bound together.
 */
function looseBytes(o: Opened, by: string, address?: string): { own: number; all: number } {
  let { own, all } = underwayBytes(o, by, address)
  const theirs = (one: { by: string; address?: string }): boolean =>
    one.by === by || (address !== undefined && one.address === address)
  for (const file of looseFiles(o)) {
    all += file.size
    if (theirs(file)) own += file.size
  }
  for (const one of arriving.get(o.handles) ?? []) {
    all += one.size
    if (theirs(one)) own += one.size
  }
  return { own, all }
}

const tooMany = (words: string): TentError =>
  new TentError('T0005', words, {
    fix: 'Store the files that were uploaded, or wait until the loose ones are removed.',
  })

/**
 * An upload is closed at the length that it states: the bytes up to that length are passed on, and whatever a
 * sender sends after them is not read.
 */
function closedAt(body: ReadableStream<Uint8Array> | null, length: number): ReadableStream<Uint8Array> {
  const reader = body?.getReader()
  let left = length
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // What follows the stated length is left where it is: the connection of a sender that sends more is closed
      // by whoever answers it.
      const part = left > 0 && reader ? await reader.read() : undefined
      if (!part || part.done) return controller.close()
      controller.enqueue(part.value.subarray(0, left))
      left -= part.value.byteLength
    },
    cancel: () => reader?.cancel(),
  })
}

/** The length that a request states of its body, in `Content-Length`. Throws T0002 where it states none. */
function lengthOf(request: Request, words: string): number {
  const length = request.headers.get('content-length')
  if (length === null || !/^\d+$/.test(length)) throw bad(words, 'length', 'required')
  return Number(length)
}

/**
 * What an upload sent in parts, or straight to a store, is held to once its bytes are in: the `file` field it
 * was begun for still takes its kind. A file that it does not take is given up again.
 */
const fitted =
  (o: Opened, caller: Caller) =>
  async (stored: StoredFile, underway: UploadUnderway): Promise<StoredFile> => {
    if (underway.for === undefined) return stored
    const asked = new URLSearchParams({
      for: underway.for,
      ...(underway.field === undefined ? {} : { field: underway.field }),
    })
    const field = fieldFor(o, caller, asked)
    const fails = field ? misfit(stored, field) : undefined
    if (fails) {
      await forgetFile(o, stored)
      throw bad(`A file of the kind ${stored.kind} is not what its field takes.`, underway.field ?? '', fails)
    }
    return stored
  }

/**
 * `POST /_t/files?upload=<id>`: an upload sent in parts goes on. With `Upload-Offset`, the body is its next
 * part, sent from that byte; with none, the answer says where it stands, and for an upload straight to a store,
 * the engine takes it in. An upload is named by the caller who began it alone.
 */
async function goneOn(o: Opened, request: Request, caller: Caller, id: string, by: string): Promise<object> {
  const offset = request.headers.get('upload-offset')
  if (offset === null) {
    const at = uploadAt(o, id, by)
    return at.direct
      ? answered(await directTaken(o, id, by, fitted(o, caller)))
      : { upload: at.upload, offset: at.offset }
  }
  if (!/^\d+$/.test(offset)) throw bad('`Upload-Offset` is the count of the bytes that arrived.', 'offset', 'pattern')
  const length = lengthOf(request, 'A part of an upload states its length, in `Content-Length`.')
  const done = await uploadPart(o, { id, by, offset: Number(offset), length, bytes: request.body }, fitted(o, caller))
  return 'fingerprint' in done ? answered(done) : done
}

/** The record of a file as an upload answers it. */
const answered = (file: StoredFile): object => ({
  id: file.id,
  name: file.name,
  kind: file.kind,
  size: file.size,
  ...(file.width === undefined ? {} : { width: file.width, height: file.height }),
})

/**
 * `POST /_t/files?name=<name>`: an upload, with the bytes as its body and the kind in `Content-Type`. It passes
 * steps 1 to 4 and 10 of the door, with `uploadSize` as its size limit and a count of its own. The `uploads`
 * rule, the counts and the sizes are all held against what the request states, before its body is read. The
 * answer is the wire form with `{ id, name, kind, size, width, height }` as its value. One that states its whole
 * length in `Upload-Length` and sends no body is begun, to be sent in parts, and answers `{ upload, offset }`;
 * with `direct` as well, where the store of the files hands out addresses, it answers `{ upload, address, until }`,
 * and its bytes go to that address.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'POST' && new URL(request.url).pathname === '/_t/files' && { name },
  steps: [1, 2, 3, 10],
  async handle({ app: o, request, caller, about, began }) {
    try {
      const asked = new URL(request.url).searchParams
      // A caller who is nobody is told apart by a visitor id, and counted by their address as well.
      const here = visit()
      const nobody = caller.kind === 'nobody'
      const from = countedAs(about.from)
      const by = nobody && here ? visitorOwner(visitorOf(here)) : callerText(caller)
      // Every request of an upload counts, each part of one that is sent in parts among them.
      const perMinute = storedLimit(o.description, 'uploadsPerMinute')
      if (!countedFor(o, `uploads:${nobody ? from : by}`, perMinute))
        throw new TentError('T0005', `More than ${perMinute} uploads in a minute came from one caller.`, {
          fix: 'Send fewer files, or raise `uploadsPerMinute` in `project.limits`.',
        })
      const upload = asked.get('upload')
      if (upload !== null) {
        const answer = await goneOn(o, request, caller, upload, by)
        logCall(o, { name, caller, began })
        return okAnswer(answer)
      }
      const file = namedAs(asked.get('name'))
      const whole = request.headers.get('upload-length')
      if (whole !== null && !/^\d+$/.test(whole))
        throw bad('`Upload-Length` is the count of the bytes of the whole upload.', 'length', 'pattern')
      const size =
        whole === null ? lengthOf(request, 'An upload states its length, in `Content-Length`.') : Number(whole)
      // Every upload is held to the most bytes an upload takes, one sent in parts or straight to a store among them:
      // what it states here, and what arrives, which its end holds to the same bound.
      const most = storedLimit(o.description, 'uploadSize')
      if (size > most)
        throw new TentError('T0003', `The upload states ${size} bytes, more than the ${most} an upload takes.`, {
          fix: 'Send a smaller file, or raise `uploadSize` in `project.limits`.',
        })
      const kind = request.headers.get('content-type') ?? undefined
      const field = fieldFor(o, caller, asked)
      keyUploads(caller, asked.get('for'))
      grantUploads(caller)
      mayUpload(o, caller, {
        name: file,
        ...(kind === undefined ? {} : { kind }),
        size,
        ...(asked.get('for') === null ? {} : { for: asked.get('for'), field: asked.get('field') }),
      })
      const loose = looseBytes(o, by, nobody ? from : undefined)
      if (loose.own + size > storedLimit(o.description, 'looseBytes'))
        throw tooMany('This caller holds more loose files than `limits.looseBytes` of the project allows.')
      if (loose.all + size > storedLimit(o.description, 'looseBytesAll'))
        throw tooMany('The app holds more loose files than `limits.looseBytesAll` of the project allows.')
      if (field && typeof field.maxSize === 'number' && size > field.maxSize)
        throw bad(`The file holds ${size} bytes, more than its field takes.`, asked.get('field') ?? '', 'max')
      const how = {
        name: file,
        ...(kind === undefined ? {} : { kind }),
        by,
        ...(nobody ? { address: from } : {}),
        most,
      }
      if (whole !== null) {
        const fn = asked.get('for')
        const fieldName = asked.get('field')
        const underway: UploadUnderway = {
          how,
          size,
          ...(fn === null ? {} : { for: fn }),
          ...(fieldName === null ? {} : { field: fieldName }),
        }
        const begun = await beginUpload(o, underway, asked.has('direct'))
        logCall(o, { name, caller, began })
        return okAnswer(begun)
      }
      // The upload counts from now on, at the length that it states, until its row is written or it fails.
      const under = arriving.get(o.handles) ?? new Set<Arriving>()
      arriving.set(o.handles, under)
      const mine: Arriving = { by, size, ...(nobody ? { address: from } : {}) }
      under.add(mine)
      const stored = await putFile(o, closedAt(request.body, size), how).finally(() => under.delete(mine))
      if (stored.size !== size) {
        await forgetFile(o, stored)
        throw bad(`The upload stated ${size} bytes, and ${stored.size} arrived.`, 'length', 'min')
      }
      // The kind is known once the bytes are read: a file that its field does not take is given up again.
      const fails = field ? misfit(stored, field) : undefined
      if (fails) {
        await forgetFile(o, stored)
        throw bad(`A file of the kind ${stored.kind} is not what its field takes.`, asked.get('field') ?? '', fails)
      }
      logCall(o, { name, caller, began })
      return okAnswer(answered(stored))
    } catch (error) {
      refusedCall(o, name, caller, began, error)
      return errorAnswer(o, name, error)
    }
  },
}
