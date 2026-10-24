import type { VectorCopy } from './copy.ts'

// A number is kept as a share of four times the usual size of its vector's numbers, in this many steps each way.
const steps = 127

/**
 * Takes how many numbers a vector of the column holds. Answers an empty copy at one byte a number, a quarter of the
 * full copy: each number as a share of four times the root of the mean of the vector's squared numbers, in 127
 * steps, cut off there, and for each row that scale, the length of its bytes and its inside number. Its nearest
 * rows are near and not exact: the store decides among them by the full vectors (`exact` is false).
 */
export function smallCopy(size: number): VectorCopy {
  let room = 1024
  let count = 0
  let numbers = new Int8Array(room * size)
  let scales = new Float64Array(room)
  let lengths = new Float64Array(room)
  let rows = new Float64Array(room)
  const placeOf = new Map<number, number>()

  /** A list of numbers with room for more, holding what the shorter one held. */
  const longer = (held: Float64Array<ArrayBuffer>): Float64Array<ArrayBuffer> => {
    const made = new Float64Array(room)
    made.set(held.subarray(0, count))
    return made
  }

  const grow = () => {
    room *= 2
    const wider = new Int8Array(room * size)
    wider.set(numbers.subarray(0, count * size))
    numbers = wider
    scales = longer(scales)
    lengths = longer(lengths)
    rows = longer(rows)
  }

  /** The scale of a vector: what one step stands for, from the root of the mean of its squared numbers. */
  const scaleOf = (vector: ArrayLike<number>): number => {
    let sum = 0
    for (let i = 0; i < size; i++) sum += vector[i] * vector[i]
    const usual = Math.sqrt(sum / size)
    return usual === 0 ? 0 : (4 * usual) / steps
  }

  return {
    exact: false,

    set(n, vector) {
      let place = placeOf.get(n)
      if (place === undefined) {
        if (count === room) grow()
        place = count++
        placeOf.set(n, place)
        rows[place] = n
      }
      const scale = scaleOf(vector)
      let sum = 0
      for (let i = 0; i < size; i++) {
        const step = scale === 0 ? 0 : Math.max(-steps, Math.min(steps, Math.round(vector[i] / scale)))
        numbers[place * size + i] = step
        sum += step * step
      }
      scales[place] = scale
      lengths[place] = Math.sqrt(sum)
    },

    remove(n) {
      const place = placeOf.get(n)
      if (place === undefined) return
      const last = --count
      if (place !== last) {
        numbers.copyWithin(place * size, last * size, last * size + size)
        scales[place] = scales[last]
        lengths[place] = lengths[last]
        rows[place] = rows[last]
        placeOf.set(rows[place], place)
      }
      placeOf.delete(n)
    },

    nearest(to, measure, limit, o = {}) {
      const total = o.only ? o.only.length : count
      const found: [number, number][] = []
      if (Math.min(limit, total) <= 0) return found
      let toLength = 0
      for (let i = 0; i < size; i++) toLength += to[i] * to[i]
      toLength = Math.sqrt(toLength)
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
            const apart = numbers[at + i] * scales[place] - to[i]
            sum += apart * apart
          }
          distance = Math.sqrt(sum)
        }
        found.push([rows[place], distance])
      }
      // `within` is held by the store against the full vectors: a near distance may stand on either side of it.
      return found.sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, limit)
    },
  }
}
