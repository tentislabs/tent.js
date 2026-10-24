import { parentPort, workerData } from 'node:worker_threads'
import { TentError } from '../../core/index.ts'
import { readOwn } from './own.ts'

// A thread that reads one file with our own readers, and tells its words or what stopped it: a file that is
// built to keep a reader busy holds no call of another caller back.
const { kind, bytes, most }: { kind: string; bytes: Uint8Array; most: number } = workerData

try {
  parentPort?.postMessage({ text: readOwn(kind, bytes, most) })
} catch (error) {
  const told =
    error instanceof TentError
      ? { code: error.code, message: error.message, ...(error.fix === undefined ? {} : { fix: error.fix }) }
      : { message: error instanceof Error ? error.message : String(error) }
  parentPort?.postMessage({ error: told })
}
