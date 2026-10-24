import { parentPort, workerData } from 'node:worker_threads'
import type { PictureFormat } from '../borrowed/sharp.ts'
import { resizerIn } from '../borrowed/sharp.ts'

// A thread that opens one picture with the resizer and tells the copy it made, or what stopped it: a picture that
// is built to keep the resizer busy holds no call of another caller back, and is ended when its time is up.
const {
  part,
  bytes,
  ask,
}: { part: string; bytes: Uint8Array; ask: { width?: number; written?: PictureFormat; points: number } } = workerData

try {
  const resizer = await resizerIn(part)
  const made =
    ask.width !== undefined && ask.written !== undefined
      ? await resizer.scaled(bytes, { width: ask.width, written: ask.written, points: ask.points })
      : await resizer.tiny(bytes, ask.points)
  parentPort?.postMessage({ bytes: made })
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) })
}
