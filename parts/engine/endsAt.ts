/**
 * Takes a piece of work whose end may move while it runs, as the wait for a part that is fetched moves it, and what
 * it is ended with. Answers a promise that is refused with that error once the end has come, and what takes the
 * timer back: the timer asks the end again each time it falls due.
 */
export function endsAt(work: { ends: number }, ended: () => Error): { timeUp: Promise<never>; cancel(): void } {
  let timer: NodeJS.Timeout | undefined
  const timeUp = new Promise<never>((_, refuse) => {
    const due = (): void => {
      const left = work.ends - performance.now()
      if (left > 0) {
        timer = setTimeout(due, left)
        timer.unref()
        return
      }
      refuse(ended())
    }
    due()
  })
  return { timeUp, cancel: () => clearTimeout(timer) }
}
