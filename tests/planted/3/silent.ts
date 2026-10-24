import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that neither prints the line it is to be killed at nor ends by itself.
writeFileSync(join(process.argv[2], 'first.txt'), String(process.pid))
await wait(600_000)
