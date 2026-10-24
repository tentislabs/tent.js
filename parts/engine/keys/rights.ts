// The rights of publishing that hold the ones before them, where a key is given one of them alone.
const ladder = ['read', 'push', 'publish']

/**
 * The rights that a key is made with by the command line: one of `read`, `push` and `publish` given alone holds
 * the ones before it too, and a list is held exactly as it is listed. In code, `keys.add` holds what it is handed.
 */
export function rightsGiven(given: readonly string[]): string[] {
  const [one] = given
  return given.length === 1 && ladder.includes(one) ? ladder.slice(0, ladder.indexOf(one) + 1) : [...given]
}

/** Whether a key with these rights holds one of the rights that an address asks for. */
export const holdsRight = (rights: readonly string[], asked: readonly string[]): boolean =>
  asked.some((one) => rights.includes(one))
