import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fingerprintOf } from '../../core/internal.ts'
import type { FileStore } from '../makers.ts'

/**
 * Where the archive of an app lies, with the copies of its backups where a store holds them: things by their
 * names, each written whole. `stored` says that it is a store of files and not the folder of the backups.
 */
export interface ArchivePlace {
  stored: boolean
  put(name: string, bytes: Uint8Array): Promise<void>
  /** The bytes of a thing, or nothing where it is not there. */
  get(name: string): Promise<Uint8Array | undefined>
  remove(name: string): Promise<void>
}

/** A place in a folder of the disk: each thing a file under its name, written beside its place first. */
export function folderPlace(folder: string): ArchivePlace {
  return {
    stored: false,
    async put(name, bytes) {
      const path = join(folder, name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.coming`, bytes)
      renameSync(`${path}.coming`, path)
    },
    async get(name) {
      try {
        return new Uint8Array(readFileSync(join(folder, name)))
      } catch {
        return undefined
      }
    },
    async remove(name) {
      rmSync(join(folder, name), { force: true })
    },
  }
}

/** Whether a store said that it holds no bytes under a fingerprint: the folder that ships, and a store of the S3 protocol. */
const gone = (error: unknown): boolean => {
  const code: unknown = Reflect.get(Object(error), 'code')
  return code === 'ENOENT' || code === 'T0001'
}

/** Reads a whole stream of bytes. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const part of stream) parts.push(part)
  return new Uint8Array(Buffer.concat(parts))
}

/**
 * A place in a store of files, which keeps bytes under a fingerprint and knows nothing else: each thing lies under
 * the fingerprint of its name with the name of the app, so two apps that share a store keep apart. A thing is
 * removed before it is written again, since a store keeps what one fingerprint names once.
 */
export function storePlace(store: FileStore, app: string): ArchivePlace {
  const keyOf = (name: string): string => fingerprintOf(new TextEncoder().encode(`tent.archive/1\n${app}\n${name}`))
  return {
    stored: true,
    async put(name, bytes) {
      const key = keyOf(name)
      await store.remove(key)
      await store.put(key, new Blob([Buffer.from(bytes)]).stream(), {
        size: bytes.length,
        kind: 'application/octet-stream',
      })
    },
    async get(name) {
      try {
        return await readAll(store.get(keyOf(name)))
      } catch (error) {
        // Bytes that are not there are nothing; a store that cannot be reached is no answer.
        if (gone(error)) return undefined
        throw error
      }
    },
    async remove(name) {
      await store.remove(keyOf(name))
    },
  }
}
