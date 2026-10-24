import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that does not pick its work up. Its work is batches of twenty lines. A start that finds a batch that was
// begun and not ended takes it for ended as it is, and ends. A start that finds none begins a batch.
const file = (name: string) => join(process.argv[2], `${name}.txt`)
const read = (name: string) => (existsSync(file(name)) ? readFileSync(file(name), 'utf8') : '')
const size = 20

const begun = read('begun').split('\n').filter(Boolean)
const ended = read('ended').split('\n')
const open = begun.filter((batch) => !ended.includes(batch))

if (open.length) {
  for (const batch of open) appendFileSync(file('ended'), `${batch}\n`)
  console.log(`left ${open.length} as it is`)
} else {
  const batch = begun.length
  appendFileSync(file('begun'), `${batch}\n`)
  for (let k = 0; k < size; k++) {
    if (k === size / 2) console.log('half')
    if (k >= size / 2) await wait(25)
    appendFileSync(file('done'), `${batch}:${k}\n`)
  }
  appendFileSync(file('ended'), `${batch}\n`)
}
