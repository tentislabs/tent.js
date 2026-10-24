import type { Frame, Link } from '../copy/link.ts'
import type { Opened } from '../opened.ts'
import { gather } from './gather.ts'

/** How many bytes a frame of a link holds. */
const bytesOf = (frame: Frame): number => (typeof frame === 'string' ? Buffer.byteLength(frame) : frame.byteLength)

/**
 * Takes an app, what the link is counted under - `copy` for a reader, `work` for a worker - and one end of the link.
 * Answers the same end, which counts the bytes of every frame it sends and of every frame that arrives.
 */
export function countedLink(o: Opened, name: 'copy' | 'work', link: Link): Link {
  return {
    send(frame) {
      gather(o, name, { bytesOut: bytesOf(frame) })
      link.send(frame)
    },
    each(fn, closed) {
      link.each((frame) => {
        gather(o, name, { bytesIn: bytesOf(frame) })
        fn(frame)
      }, closed)
    },
    close: () => link.close(),
  }
}
