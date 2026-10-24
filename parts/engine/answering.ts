import type { Opened } from './opened.ts'

/** The requests of one app that are being answered: each has the number it began with. */
interface Answering {
  next: number
  open: Set<number>
}

const held = new WeakMap<Opened, Answering>()

const of = (o: Opened): Answering => {
  let mine = held.get(o)
  if (!mine) {
    mine = { next: 0, open: new Set() }
    held.set(o, mine)
  }
  return mine
}

/** Carries the answering of one request out, and holds it as under way until it is answered or has failed. */
export async function answering<Answer>(o: Opened, work: () => Promise<Answer>): Promise<Answer> {
  const mine = of(o)
  const number = mine.next++
  mine.open.add(number)
  try {
    return await work()
  } finally {
    mine.open.delete(number)
  }
}

/** The number that the next request of an app begins with. */
export const nextRequest = (o: Opened): number => of(o).next

/** Whether a request that began with that number, or after it, is still being answered. */
export function answeringSince(o: Opened, number: number): boolean {
  for (const one of of(o).open) if (one >= number) return true
  return false
}
