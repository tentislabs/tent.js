// The body of a request that holds files: sent as a stream of its length, and opened anew at each read.
import type { Stream } from './env.ts'

/** A body that holds files: how many bytes it is, which the files know, and what opens its bytes anew. */
export interface FileBody {
  length: number
  open(): ReadableStream<Uint8Array>
}

/** One piece of a body: bytes held in memory, or a file by its size and what opens its bytes. */
export type Piece = Uint8Array | { size: number; open(): Promise<Stream> }

/** The bytes of the pieces in their order, each file opened only when it is read to, and held to its size. */
async function* piecesRead(pieces: Piece[]): AsyncGenerator<Uint8Array> {
  for (const piece of pieces) {
    if (piece instanceof Uint8Array) {
      yield piece
      continue
    }
    let seen = 0
    for await (const part of await piece.open()) {
      seen += part.length
      // The length was stated before the first byte went: a file that grew or shrank would end the body wrong.
      if (seen > piece.size) throw new Error('A file of the body holds more bytes than its size.')
      yield part
    }
    if (seen !== piece.size) throw new Error('A file of the body holds fewer bytes than its size.')
  }
}

/**
 * Takes the pieces of a body in their order. Answers the bytes themselves where no piece is a file, and otherwise
 * the body they make: its length, and a stream of it that opens each file only when it is read to.
 */
export function bodyOf(pieces: Piece[]): Uint8Array<ArrayBuffer> | FileBody {
  if (pieces.every((one) => one instanceof Uint8Array)) return new Uint8Array(Buffer.concat(pieces))
  const length = pieces.reduce((sum, one) => sum + (one instanceof Uint8Array ? one.length : one.size), 0)
  return {
    length,
    open() {
      const read = piecesRead(pieces)
      // No byte is asked for before a reader asks: a body that is never read opens no file.
      return new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            const next = await read.next()
            if (next.done) controller.close()
            else controller.enqueue(next.value)
          },
          async cancel() {
            await read.return(undefined)
          },
        },
        { highWaterMark: 0 },
      )
    },
  }
}

/**
 * A request whose body holds files. Each read of its body, and each copy of it, opens the body anew, so that a
 * signer may read it more than once; the guarded fetch sends it as a stream of its length, and anew after a 307.
 */
export class FileRequest extends Request {
  readonly files: FileBody

  /** Takes the address, the method, the lines, the signal and the redirect of the request, and its body. */
  constructor(
    address: string | URL,
    init: { method: string; headers: Headers; signal?: AbortSignal; redirect?: RequestRedirect },
    files: FileBody,
  ) {
    // A body that is a stream is sent as it is read: the runtime's word for that is `duplex`.
    const streamed = { body: files.open(), duplex: 'half' as const }
    super(address, { ...init, ...streamed })
    this.files = files
  }

  /** The body opened anew, as an answer reads it, with the lines of the request. */
  private opened(): Response {
    return new Response(this.files.open(), { headers: this.headers })
  }

  override clone(): FileRequest {
    return new FileRequest(
      this.url,
      { method: this.method, headers: new Headers(this.headers), signal: this.signal, redirect: this.redirect },
      this.files,
    )
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return this.opened().arrayBuffer()
  }

  override bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return this.opened().bytes()
  }

  override blob(): Promise<Blob> {
    return this.opened().blob()
  }

  override text(): Promise<string> {
    return this.opened().text()
  }

  override json(): Promise<unknown> {
    return this.opened().json()
  }

  override formData(): Promise<FormData> {
    return this.opened().formData()
  }
}
