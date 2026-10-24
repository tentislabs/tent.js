import { TentError } from '../../core/index.ts'

/** What the work of one task on a worker says, held to its rate before it crosses to the writer. */
export interface Saying {
  say(value: unknown): void
  // Sends what still waits: the work ended, and what it said last goes before its end.
  flush(): void
}

/**
 * Takes what sends one value to the writer, how many values a second may cross, and the most bytes one may hold.
 * Answers what the work of a task is handed as `say`: a value past the most is T5102, and the values cross that
 * many times a second at most, the newest taking the place of one that waits.
 */
export function sayingOf(send: (value: unknown) => void, perSecond: number, most: number): Saying {
  const every = 1000 / Math.max(1, perSecond)
  let sentAt = Number.NEGATIVE_INFINITY
  let waits: { value: unknown } | undefined
  let timer: NodeJS.Timeout | undefined
  const now = (value: unknown): void => {
    sentAt = performance.now()
    send(value)
  }
  return {
    say(value) {
      const size = Buffer.byteLength(JSON.stringify(value) ?? 'null')
      if (size > most)
        throw new TentError('T5102', `What the step said holds ${size} bytes, past \`limits.inFrame\` of ${most}.`, {
          fix: 'Say less at a time, within `limits.inFrame`: what a step says is a value to show.',
        })
      const wait = sentAt + every - performance.now()
      if (wait <= 0 && !timer) return now(value)
      waits = { value }
      timer ??= setTimeout(
        () => {
          timer = undefined
          const held = waits
          waits = undefined
          if (held) now(held.value)
        },
        Math.max(0, wait),
      )
    },
    flush() {
      if (timer) clearTimeout(timer)
      timer = undefined
      const held = waits
      waits = undefined
      if (held) now(held.value)
    },
  }
}
