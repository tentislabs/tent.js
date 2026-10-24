/** The copy that the store keeps in memory of the vectors of one column. */
export interface VectorCopy {
  /** Whether its nearest rows are the true nearest: false for a copy at one byte a number. */
  exact: boolean
  /** Sets the vector of a row, by its inside number. */
  set(n: number, vector: Float32Array): void
  /** Takes the vector of a row out. */
  remove(n: number): void
  /**
   * Answers the nearest `limit` rows to a vector as their inside number and their distance, nearest first, and at
   * the same distance the lower inside number first. `only`: the inside numbers that may be looked at. `within`:
   * rows farther than this are left out. `without`: inside numbers that are not looked at. A row with no direction
   * is left out of a search by the cosine.
   */
  nearest(
    to: ArrayLike<number>,
    measure: 'cosine' | 'straight',
    limit: number,
    o?: { only?: number[]; within?: number; without?: ReadonlySet<number> },
  ): [n: number, distance: number][]
}

/**
 * Takes how many numbers a vector of the column holds. Answers an empty copy: every number as it is stored, and
 * for each row its length and its inside number. It starts with room for 1,024 rows and doubles when it is full.
 * When a vector is taken out, the last row of the copy is moved into its place. A search works the distance of
 * each row out with sums in 64 bits, in the order of the numbers, as a search over every stored vector would.
 */
export function vectorCopy(size: number): VectorCopy {
  let room = 1024
  let count = 0
  let numbers = new Float32Array(room * size)
  let lengths = new Float64Array(room)
  let rows = new Float64Array(room)
  const placeOf = new Map<number, number>()

  const grow = () => {
    room *= 2
    const [wider, longer, more] = [new Float32Array(room * size), new Float64Array(room), new Float64Array(room)]
    wider.set(numbers.subarray(0, count * size))
    longer.set(lengths.subarray(0, count))
    more.set(rows.subarray(0, count))
    numbers = wider
    lengths = longer
    rows = more
  }

  return {
    exact: true,

    set(n, vector) {
      let place = placeOf.get(n)
      if (place === undefined) {
        if (count === room) grow()
        place = count++
        placeOf.set(n, place)
        rows[place] = n
      }
      numbers.set(vector, place * size)
      let sum = 0
      for (let i = 0; i < size; i++) sum += vector[i] * vector[i]
      lengths[place] = Math.sqrt(sum)
    },

    remove(n) {
      const place = placeOf.get(n)
      if (place === undefined) return
      const last = --count
      if (place !== last) {
        numbers.copyWithin(place * size, last * size, last * size + size)
        lengths[place] = lengths[last]
        rows[place] = rows[last]
        placeOf.set(rows[place], place)
      }
      placeOf.delete(n)
    },

    nearest(to, measure, limit, o = {}) {
      const total = o.only ? o.only.length : count
      const most = Math.min(limit, total)
      if (most <= 0) return []
      let toLength = 0
      for (let i = 0; i < size; i++) toLength += to[i] * to[i]
      toLength = Math.sqrt(toLength)
      const bestRows = new Float64Array(most)
      const bestDistances = new Float64Array(most).fill(Number.POSITIVE_INFINITY)
      let held = 0
      let worst = 0
      const findWorst = () => {
        worst = 0
        for (let j = 1; j < most; j++)
          if (
            bestDistances[j] > bestDistances[worst] ||
            (bestDistances[j] === bestDistances[worst] && bestRows[j] > bestRows[worst])
          )
            worst = j
      }
      for (let k = 0; k < total; k++) {
        const place = o.only ? placeOf.get(o.only[k]) : k
        if (place === undefined || o.without?.has(rows[place])) continue
        const at = place * size
        let distance: number
        if (measure === 'cosine') {
          // A vector of zeros has no direction.
          if (lengths[place] === 0) continue
          let dot = 0
          for (let i = 0; i < size; i++) dot += numbers[at + i] * to[i]
          distance = 1 - dot / (lengths[place] * toLength)
        } else {
          let sum = 0
          for (let i = 0; i < size; i++) {
            const apart = numbers[at + i] - to[i]
            sum += apart * apart
          }
          distance = Math.sqrt(sum)
        }
        if (o.within !== undefined && distance > o.within) continue
        const n = rows[place]
        if (held < most) {
          bestDistances[held] = distance
          bestRows[held] = n
          if (++held === most) findWorst()
        } else if (distance < bestDistances[worst] || (distance === bestDistances[worst] && n < bestRows[worst])) {
          bestDistances[worst] = distance
          bestRows[worst] = n
          findWorst()
        }
      }
      const found: [number, number][] = []
      for (let j = 0; j < held; j++) found.push([bestRows[j], bestDistances[j]])
      return found.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    },
  }
}
