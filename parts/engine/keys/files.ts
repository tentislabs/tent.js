import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { holdsScope } from '../door/scopes.ts'

const outside = (what: string): TentError =>
  new TentError('T3101', `${what} is outside the scopes of the key: it holds no scope \`files\`.`, {
    fix: "Make a key with the scope `'files'`, or upload for a function that its scopes name, with `&for=`.",
  })

/**
 * An upload of a key: without the scope `files` it uploads only with `&for=` naming a function of its scopes.
 * Throws T3101 for any other.
 */
export function keyUploads(caller: Caller, forFunction: string | null): void {
  if (holdsScope(caller, 'files')) return
  if (forFunction === null || !holdsScope(caller, forFunction)) throw outside('An upload')
}

/**
 * A download of a key, at the files door and at the image door: without the scope `files` it downloads only its
 * own loose files, a file that a call answered it among them. Takes whether the rule of a download let the caller
 * have the file. Throws T3101 for any other, whether or not the file is there, so that nothing tells which are.
 */
export function keyDownloads(caller: Caller, file: { looseAt?: unknown } | undefined, may: boolean): void {
  if (holdsScope(caller, 'files')) return
  if (!may || file?.looseAt === undefined) throw outside('A download')
}
