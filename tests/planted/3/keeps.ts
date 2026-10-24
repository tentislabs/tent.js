import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that picks its work up. Its work is batches of twenty lines. A start that finds a batch that was begun
// and not ended writes the lines that are missing, and ends. A start that finds none begins a batch.
const file = (name: string) => join(process.argv[2], `${name}.txt`)
const read = (name: string) => (existsSync(file(name)) ? readFileSync(file(name), 'utf8') : '')
const size = 20

const begun = read('begun').split('\n').filter(Boolean)
const ended = read('ended').split('\n')
const open = begun.filter((batch) => !ended.includes(batch))

if (open.length) {
  // A kill may cut the last line short.
  if (read('done') && !read('done').endsWith('\n')) appendFileSync(file('done'), '\n')
  const written = new Set(read('done').split('\n'))
  for (const batch of open) {
    const missing = Array.from({ length: size }, (_, k) => `${batch}:${k}`).filter((line) => !written.has(line))
    for (const line of missing) appendFileSync(file('done'), `${line}\n`)
    appendFileSync(file('ended'), `${batch}\n`)
    console.log(`picked up ${missing.length}`)
  }
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
