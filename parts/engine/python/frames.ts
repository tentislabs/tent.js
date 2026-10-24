/** The bytes of one frame of the channel: four bytes of its length, the lowest first, and one JSON value. */
export function channelFrameOf(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value))
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  return Buffer.concat([head, body])
}

/**
 * Takes the most bytes a frame may hold, what is told each frame that is whole, and what is told a frame that is
 * larger, or that holds no JSON. Answers what is handed each piece of the stream as it comes.
 */
export function frameReader(
  most: number,
  told: (value: unknown) => void,
  refused: (why: string) => void,
): (piece: Buffer) => void {
  let held: Buffer = Buffer.alloc(0)
  let over = false
  return (piece) => {
    if (over) return
    held = held.length ? Buffer.concat([held, piece]) : piece
    while (held.length >= 4) {
      const length = held.readUInt32LE(0)
      if (length > most) {
        over = true
        refused(`a frame of ${length} bytes, past the ${most} that a frame may hold`)
        return
      }
      if (held.length < 4 + length) return
      const body = held.subarray(4, 4 + length)
      held = held.subarray(4 + length)
      let value: unknown
      try {
        value = JSON.parse(body.toString('utf8'))
      } catch {
        over = true
        refused('a frame that holds no JSON')
        return
      }
      told(value)
    }
  }
}
