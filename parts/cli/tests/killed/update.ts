// A program that is killed while it updates an install, and started again: it says which version it found in use,
// and whether that version lay whole, and then takes the update.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardedFetch } from '../../../connect/index.ts'
import { updateInstall } from '../../install/updateInstall.ts'

const [home, from, keys] = process.argv.slice(2)
const current = readFileSync(join(home, 'current'), 'utf8').trim()
const whole = existsSync(join(home, 'versions', current, 'player', 'tent.mjs'))
console.log(`found ${current} ${whole ? 'whole' : 'broken'}`)
const port = new URL(from).port
const done = await updateInstall(home, {
  from,
  keys: JSON.parse(keys),
  fetch: guardedFetch({ mode: 'live', privateHosts: [`http://127.0.0.1:${port}`] }),
})
console.log(`updated ${done.version}`)
