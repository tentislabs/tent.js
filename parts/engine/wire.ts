import type { WireError } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { CodeRow } from '../core/internal.ts'
import { codes } from '../core/internal.ts'
import { failureOf, isShown, statusOf } from './door/failure.ts'
import type { Opened } from './opened.ts'
import { visit } from './visit.ts'
import { spanNow } from './trace/span.ts'

const registry: Record<string, CodeRow> = codes

// What live data says of an error that is not the caller's to see, and of a code that has no sentence of its own.
const general = codes.T0009.sentence

/**
 * The general sentence of a code, which is all that live data says of an error. It stands in the row of the code
 * in the registry of codes, so that a step which builds a code adds its sentence nowhere.
 */
const sentenceOf = (code: string): string =>
  (Object.hasOwn(registry, code) ? registry[code].sentence : undefined) ?? general

// The codes of the framework whose `fields` a caller is sent.
const withFields = ['T0002', 'T0029', 'T0008', 'T7117', 'T7120', 'T9101', 'T9103', 'T9104', 'T9107', 'T9108']

// The codes with no status that a browser is sent as themselves: a value that does not fit, no mailer, mail not
// sent, and an address the guarded fetch refused, which tell the caller nothing of the engine.
const asThemselves = ['T2107', 'T0020', 'T0021', 'T0022']

// What every answer of the engine says: its type is not to be guessed, and it is kept by nobody.
export const everyAnswer = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }

/** Answers a JSON body with a status, with the headers of every answer of the engine. */
export const jsonAnswer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...everyAnswer, 'content-type': 'application/json; charset=utf-8' },
  })

/** Answers what worked, in the wire form: `{ "ok": true, "value": ... }`, with a moment as text in the standard form. */
export const okAnswer = (value: unknown): Response => jsonAnswer(200, { ok: true, value, ...changedCaller() })

/**
 * What an answer in the wire form says where the request that is being answered started or ended a session, or
 * was sent by a page whose user is no longer its caller: the page then asks for its screen again.
 */
function changedCaller(): { caller?: 'changed' } {
  return visit()?.changed ? { caller: 'changed' } : {}
}

/**
 * Takes an error, whether the full message is told, which holds on test data alone, and what the error names
 * beside itself, and whether a command is told it. Answers the wire error and its status: a code of the framework
 * that has a status as itself, an own `fail` of the app with its own code and words and 400, T2107, T0020, T0021
 * and T0022 as themselves with 500 and the ref, and so every code of the framework to a command, and anything else as
 * T0009 with 500 and its ref. On
 * live data the message is the general sentence of the code, and neither `fix` nor `where` is sent.
 */
export function wireError(
  error: unknown,
  full: boolean,
  more: { ref?: string; running?: string; command?: boolean } = {},
): { status: number; error: WireError } {
  const told = error instanceof TentError ? error : undefined
  const place =
    full && told ? { ...(told.fix ? { fix: told.fix } : {}), ...(told.where ? { where: told.where } : {}) } : {}
  if (isShown(error)) {
    const status = statusOf(error.code)
    // A code that is none of ours is the builder's own: it is sent as it was written, in every mode.
    if (status === undefined)
      return {
        status: 400,
        error: {
          code: error.code,
          name: error.name,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      }
    return {
      status,
      error: {
        code: error.code,
        name: error.name,
        message: full ? error.message : sentenceOf(error.code),
        ...(error.fields && withFields.includes(error.code) ? { fields: error.fields } : {}),
        ...(error.code === 'T0007' && more.running ? { running: more.running } : {}),
        ...place,
      },
    }
  }
  // A code of the framework that has no status, with the status of T0009 and its ref: a command is told every
  // one as itself, and a browser the codes of what the app itself did, which tell nothing of the engine.
  if (told && /^T\d{4}$/.test(told.code) && (more.command || asThemselves.includes(told.code)))
    return {
      status: 500,
      error: {
        code: told.code,
        name: told.name,
        message: full ? told.message : general,
        ...(more.ref ? { ref: more.ref } : {}),
        ...place,
      },
    }
  const message = full ? (error instanceof Error ? error.message : String(error)) : general
  return {
    status: 500,
    error: { code: 'T0009', name: 'internal', message, ...(more.ref ? { ref: more.ref } : {}), ...place },
  }
}

/**
 * Takes an app, the name of what failed, and the error. Answers the failure in the wire form, with the status of
 * its code, as the mode of the app says a caller sees it: an error that is not the caller's to see is written into
 * the log, and the answer holds the ref that finds it there.
 */
export function errorAnswer(o: Opened, name: string, error: unknown): Response {
  const { ref } = failureOf(o, name, error)
  const { status, error: sent } = wireError(error, o.mode !== 'live', { ...(ref ? { ref } : {}), running: o.version })
  // The trace of the failure stands beside its ref, so that a person can hand it on.
  const trace = spanNow()?.trace
  return jsonAnswer(status, { ok: false, error: trace && ref ? { ...sent, trace } : sent, ...changedCaller() })
}
