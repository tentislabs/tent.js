/** Whether what the writer answered a `may` is the answer of an agreed call that was made already, which stands. */
export function madeAlready(said: unknown): said is { made: true; answer?: unknown } {
  return Reflect.get(Object(said), 'made') === true
}
