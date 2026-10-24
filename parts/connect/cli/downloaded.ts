import { createWriteStream } from 'node:fs'
import { once } from 'node:events'

/**
 * Takes an answer that carries a file, and the path it is written to. Writes the bytes as they arrive, so a file of
 * any size takes no more memory than a part of it; the time is the reach's to bound.
 */
export async function written(answer: Response, path: string): Promise<void> {
  const out = createWriteStream(path)
  const closed = once(out, 'close')
  try {
    const reader = answer.body?.getReader()
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read())
      if (!out.write(read.value)) await once(out, 'drain')
  } finally {
    out.end()
    await closed
  }
}
