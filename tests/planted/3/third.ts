import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that ends at once, but for its third start, which prints a line and then goes on for a long while.
const starts = join(process.argv[2], 'starts.txt')
appendFileSync(starts, 'start\n')
if (readFileSync(starts, 'utf8').split('\n').filter(Boolean).length === 3) {
  console.log('go')
  await wait(20_000)
  appendFileSync(starts, 'not killed\n')
}
console.log('ended')
