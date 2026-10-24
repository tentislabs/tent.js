import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that fails by itself, with another number than 0, at its first two starts, and whose line is printed
// only after that: by a program it started, which holds on to what the program prints into. Its third start
// prints the line itself and goes on for a long while. Every later start ends at once.
const starts = join(process.argv[2], 'starts.txt')
appendFileSync(starts, 'start\n')
const count = readFileSync(starts, 'utf8').split('\n').filter(Boolean).length
if (count < 3) {
  spawn(process.execPath, ['-e', "setTimeout(() => console.log('go'), 300)"], {
    stdio: ['ignore', 'inherit', 'ignore'],
    detached: true,
  }).unref()
  process.exitCode = 3
} else if (count === 3) {
  console.log('go')
  await wait(20_000)
} else console.log('ended')
