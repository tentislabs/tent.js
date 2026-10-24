/**
 * Takes a bound of bytes. Answers a keeper of things by their keys, each counted at the bytes it was put with. Where
 * a thing that is put takes the whole past the bound, the one asked for longest ago goes first, and the next, until
 * the whole fits. A thing that is larger than the bound alone is kept for nobody. So what is kept of what was
 * served never grows past the bound, however many things were asked for.
 */
export function keptBytes<Value>(bound: number): {
  get(key: string): Value | undefined
  put(key: string, value: Value, bytes: number): void
  bytes(): number
} {
  // A map holds its keys in the order they were set: the first is the one asked for longest ago.
  const held = new Map<string, { value: Value; bytes: number }>()
  let whole = 0
  const drop = (key: string): void => {
    whole -= held.get(key)?.bytes ?? 0
    held.delete(key)
  }
  return {
    get(key) {
      const one = held.get(key)
      if (!one) return undefined
      held.delete(key)
      held.set(key, one)
      return one.value
    },
    put(key, value, bytes) {
      drop(key)
      if (bytes > bound) return
      held.set(key, { value, bytes })
      whole += bytes
      for (const oldest of held.keys()) {
        if (whole <= bound) break
        drop(oldest)
      }
    },
    bytes: () => whole,
  }
}
