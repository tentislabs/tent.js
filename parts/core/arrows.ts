import type { Finding } from './errors.ts'
import { finding } from './finding.ts'
import { isStored } from './record.ts'

// The words that take an arrow, each with the places of its values where one stands. The arrow of `step.all` and
// of `step.first` stands in the second place, or the first place holds a list of arrows.
const arrowAt: Record<string, number> = { each: 1, step: 1, 'step.all': 1, 'step.first': 1 }

/**
 * Takes a stored value, and the findings to add to. Finds each word that is handed another value in the place of
 * its arrow, anywhere in the value: T0011, by the dotted name of the place. It is the one rule of the format that
 * the types cannot say.
 */
export function arrowsIn(stored: unknown, found: Finding[]): void {
  // The way to where the walk stands is written out only for a finding: a description holds many places.
  const way: (string | number)[] = []
  const inside = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        way.push(i)
        inside(node[i])
        way.pop()
      }
      return
    }
    if (!isStored(node)) return
    const at = typeof node.fn === 'string' && Object.hasOwn(arrowAt, node.fn) ? arrowAt[node.fn] : undefined
    if (at !== undefined && Array.isArray(node.args)) {
      const [first, second] = [node.args[0], node.args[at]]
      const lists = node.fn !== 'each' && node.fn !== 'step' && second === undefined && Array.isArray(first)
      const arrows = lists
        ? first.every((one) => isStored(one) && 'arrow' in one)
        : isStored(second) && 'arrow' in second
      if (!arrows) {
        const path = way.join('.')
        found.push(
          finding('T0011', `\`${path}\` hands the word ${node.fn} a value in the place of its arrow.`, {
            fields: { [path]: 'type' },
            fix: 'A word that takes an arrow is handed one that is written in place.',
          }),
        )
      }
    }
    for (const name of Object.keys(node)) {
      way.push(name)
      inside(node[name])
      way.pop()
    }
  }
  inside(stored)
}
