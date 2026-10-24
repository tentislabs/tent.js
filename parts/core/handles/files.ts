import { member } from '../handle.ts'

/** A part of a file, by its first and its last byte. */
interface Range {
  from?: number
  to?: number
}

/** The handle of stored files. Every member answers a promise, but `stream`, which answers a stream. */
interface Files {
  put(content: Uint8Array | ReadableStream | string, o?: { name?: string; kind?: string }): Promise<string>
  get(id: string, range?: Range): Promise<Uint8Array>
  stream(id: string, range?: Range): ReadableStream
  remove(id: string): Promise<void>
  info(id: string): Promise<{ id: string; name?: string; kind: string; size: number } | undefined>
  text(id: string): Promise<string>
  setKind(id: string, kind: string): Promise<void>
  signedUrl(id: string, o: { for: string }): string
}

export const files: Files = {
  put: member('files', 'put'),
  get: member('files', 'get'),
  stream: member('files', 'stream'),
  remove: member('files', 'remove'),
  info: member('files', 'info'),
  text: member('files', 'text'),
  setKind: member('files', 'setKind'),
  signedUrl: member('files', 'signedUrl'),
}
