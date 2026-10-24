import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that does something a moment after its line: 150 milliseconds after it, it writes a file. Its second
// start ends at once.
const file = (name: string) => join(process.argv[2], `${name}.txt`)
if (!existsSync(file('first'))) {
  writeFileSync(file('first'), String(process.pid))
  console.log('go')
  await wait(150)
  writeFileSync(file('after'), 'the program went on after its line')
  await wait(20_000)
}
console.log('ended')
