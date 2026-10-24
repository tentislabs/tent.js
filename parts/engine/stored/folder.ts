import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import type { FileStore } from '../makers.ts'
import { streamed } from '../web/streamed.ts'

/**
 * Takes the data folder of an app. Answers the file store that ships: a folder, `files/`, that keeps bytes under
 * their fingerprint and knows nothing else. Bytes go in and out as streams, so the size of a file is never the
 * size of the memory. What is written lies beside its place first, and is renamed into it once it is whole.
 */
export function folderStore(dataFolder: string): FileStore {
  const root = join(dataFolder, 'files')
  // The first two characters of a fingerprint name its folder, so that no folder holds every file.
  const pathOf = (fingerprint: string): string => {
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('A file is stored under the fingerprint of its bytes.')
    return join(root, fingerprint.slice(0, 2), fingerprint)
  }
  let writing = 0
  return {
    async put(fingerprint, bytes) {
      const path = pathOf(fingerprint)
      // The same bytes are kept once.
      if (existsSync(path)) {
        await bytes.cancel()
        return
      }
      mkdirSync(join(root, fingerprint.slice(0, 2)), { recursive: true })
      const beside = `${path}.${process.pid}.${++writing}.part`
      try {
        await bytes.pipeTo(Writable.toWeb(createWriteStream(beside)))
        renameSync(beside, path)
      } finally {
        rmSync(beside, { force: true })
      }
    },
    get(fingerprint, range) {
      const path = pathOf(fingerprint)
      // A file that is gone fails at the first byte, before the head of an answer is sent.
      const size = statSync(path).size
      const [start, end] = [range?.from ?? 0, Math.min(range?.to ?? size - 1, size - 1)]
      if (size === 0 || start > end) return new ReadableStream({ start: (controller) => controller.close() })
      // Each part is read when it is asked for: a reader that is slow holds no more of the file than one part.
      return streamed(createReadStream(path, { start, end }))
    },
    async remove(fingerprint) {
      rmSync(pathOf(fingerprint), { force: true })
    },
  }
}
