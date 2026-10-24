/** What keeps a value under a key: a map, or a map that lets go of a key nothing else holds. */
interface Keeps<Key, Value> {
  get(key: Key): Value | undefined
  set(key: Key, value: Value): unknown
}

/** Answers what a map holds under a key. Where it holds nothing there, the value is made, kept and answered. */
export function keptIn<Key, Value>(map: Keeps<Key, Value>, key: Key, make: () => Value): Value {
  const held = map.get(key)
  if (held !== undefined) return held
  const made = make()
  map.set(key, made)
  return made
}
