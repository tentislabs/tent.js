import { closeSync, openSync, readSync, statSync } from 'node:fs'

// How many bytes of a file one piece of its stream holds.
const pieceSize = 1_048_576

// How long whoever takes the file may ask for no piece, in milliseconds: after that it has given the file up.
const givenUpAfter = 60_000

/**
 * Takes the path of a file, and what is told once the file was sent to its end or given up. Answers the file as
 * bytes that are read from the disk piece by piece, as whoever takes them asks for the next: the whole file is at
 * no moment in memory, and the file is held open between two pieces by nothing. Whoever asks for no piece for a
 * minute has given the file up. The answer states the length of the file.
 */
export function fileAnswer(path: string, sent: () => void): Response {
  const size = statSync(path).size
  let at = 0
  let over = false
  let idle: NodeJS.Timeout | undefined
  const end = (): void => {
    clearTimeout(idle)
    if (over) return
    over = true
    sent()
  }
  const waits = (): void => {
    clearTimeout(idle)
    idle = setTimeout(end, givenUpAfter)
    idle.unref()
  }
  waits()
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (over) {
          controller.error(new Error('The file was given up, and is sent no further.'))
          return
        }
        try {
          const piece = Buffer.alloc(Math.min(pieceSize, size - at))
          const file = openSync(path, 'r')
          let read = 0
          try {
            read = readSync(file, piece, 0, piece.length, at)
          } finally {
            closeSync(file)
          }
          // A file that shrank while it was sent cannot be sent at its length: what was not read is never sent.
          if (read === 0 && piece.length) throw new Error('The file grew shorter while it was sent.')
          at += read
          if (read) controller.enqueue(new Uint8Array(piece.buffer, piece.byteOffset, read))
          if (at < size) waits()
          else {
            end()
            controller.close()
          }
        } catch (error) {
          end()
          controller.error(error)
        }
      },
      cancel: end,
    },
    // Nothing is read ahead: a piece is read when it is asked for, so the file counts as sent when it was taken.
    { highWaterMark: 0 },
  )
  return new Response(body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
