import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that prints its line at its first start, and at its second start never ends by itself.
const second = join(process.argv[2], 'second.txt')
if (existsSync(join(process.argv[2], 'first.txt'))) {
  writeFileSync(second, String(process.pid))
  await wait(600_000)
}
writeFileSync(join(process.argv[2], 'first.txt'), '')
console.log('go')
await wait(20_000)
