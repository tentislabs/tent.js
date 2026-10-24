import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A program that starts a program of its own, which goes on for as long as nothing ends it. Its second start ends.
// On Windows a program that the runtime starts ends with its starter, unless it is started apart from it. Elsewhere
// it outlives its starter as it is, and one that is started apart leads a group of its own.
const started = join(process.argv[2], 'started.txt')
if (!existsSync(started)) {
  const own = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: process.platform === 'win32',
  })
  writeFileSync(started, String(own.pid))
  console.log('up')
  await wait(20_000)
}
console.log('ended')
