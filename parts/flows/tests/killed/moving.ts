// The clock of a program that is killed while the starts of a paced flow wait: it moves on a minute every tenth of
// a second while a timer is set, so a start that waits past a minute, as `perMinute` counts, goes within the bound
// of the harness.
const timers = new Set<{ at: number; fn: () => void }>()
let moved = 0
let beat: ReturnType<typeof setInterval> | undefined

/** Moves the clock on a minute and carries out each timer whose moment came; with no timer left, it stands. */
function tick(): void {
  moved += 60_000
  for (const one of [...timers])
    if (one.at <= movingClock.now()) {
      timers.delete(one)
      one.fn()
    }
  if (!timers.size && beat) {
    clearInterval(beat)
    beat = undefined
  }
}

export const movingClock = {
  now: (): number => Date.now() + moved,
  setTimer: (at: number, fn: () => void): (() => void) => {
    const one = { at, fn }
    timers.add(one)
    beat ??= setInterval(tick, 100)
    return () => void timers.delete(one)
  },
}
