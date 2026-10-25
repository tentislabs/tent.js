import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

// A program that works for half a second and ends by itself: far sooner than the time its kill is drawn within.
appendFileSync(join(process.argv[2], 'starts.txt'), 'start\n')
await new Promise((done) => setTimeout(done, 500))
console.log('ended')
