import { mark } from '../mark.ts'
import type { None, Type } from '../type.ts'

/** The fields of the input of a call. A field is named as the service names it. */
type Fields = { readonly [name: string]: Type }

/** What a call of a service may state beside its method and its path. */
export interface CallOptions<I, Out> {
  input?: I
  output?: Out
  body?: 'json' | 'form' | 'files' | { text: string; type?: string } | { bytes: string; type?: string }
  query?: readonly string[]
  headers?: Record<string, string>
  lists?: 'repeat' | 'brackets' | 'comma'
  files?: 'base64'
  sends?: boolean
  changes?: boolean
  about?: string
}

/** A call of a service, as a service holds it in `calls`. */
export interface ServiceCall<I = unknown, Out = unknown> extends CallOptions<I, Out> {
  method: string
  path: string
}

/**
 * Takes a method, the path that is joined to the address of the service, and what the call states. Answers the
 * record of the call. It is the word for a method that has none of its own.
 */
export function request<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  method: string,
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return mark({ method, path, ...o })
}

/** Takes a path and what the call states. Answers the record of a call with the method GET. */
export function get<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return request('GET', path, o)
}

/** Takes a path and what the call states. Answers the record of a call with the method POST. */
export function post<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return request('POST', path, o)
}

/** Takes a path and what the call states. Answers the record of a call with the method PUT. */
export function put<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return request('PUT', path, o)
}

/** Takes a path and what the call states. Answers the record of a call with the method PATCH. */
export function patch<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return request('PATCH', path, o)
}

/** Takes a path and what the call states. Answers the record of a call with the method DELETE. */
export function del<const I extends Fields = None, const Out extends Type | undefined = undefined>(
  path: string,
  o?: CallOptions<I, Out>,
): ServiceCall<I, Out> {
  return request('DELETE', path, o)
}
