// A program that opens the app of the desk, writes to the files of its teams, says `written`, and waits for its
// end. Started again after the kill, it opens the app once more and says what it finds, as one line of JSON.
// Run: node desk.ts <bundle> <data folder> <open | ids | pass> [<the bundle of the pass> <the bundle after it>]
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const [bundle, dataFolder, what, passed, after] = process.argv.slice(2)
const notes = join(dataFolder, '..', `${what}.json`)
const second = existsSync(notes)
const system = { as: { kind: 'system' } }

// The second start of `ids` runs with the clock of the system set back a day, from before the engine is loaded.
const realNow = Date.now
if (second && what === 'ids') Date.now = () => realNow() - 86_400_000

const { createEngine } = await import('../../../engine/index.ts')

// A clock that the program moves: the time of the system, and what was added to it.
let ahead = 0
let timers = []
const clock = {
  now: () => Date.now() + ahead,
  setTimer(at, run) {
    const timer = { at, run }
    timers.push(timer)
    return () => {
      timers = timers.filter((one) => one !== timer)
    }
  },
}
const advance = (ms) => {
  ahead += ms
  for (;;) {
    const due = timers.filter((one) => one.at <= clock.now()).sort((a, b) => a.at - b.at)[0]
    if (!due) break
    timers = timers.filter((one) => one !== due)
    due.run()
  }
}

const fileOf = (team) => join(dataFolder, 'tenants', 'teams', team.slice(-2), `${team}.db`)
const besideOf = (team) => ['-wal', '-shm'].filter((ending) => existsSync(`${fileOf(team)}${ending}`))
const idOf = (row) => String(row.id)

/** `tent data files`, asked of the app with no network. */
async function listed(app) {
  const { port, token } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const request = new Request(`http://127.0.0.1:${port}/_t/admin/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ args: { what: 'files' } }),
  })
  const body = await (await app.request(request)).json()
  if (!body.ok) throw new Error(JSON.stringify(body.error))
  return body.value.files
}

/** The lines of the log whose message holds a piece, with their data read. */
function logLines(piece) {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT message, data FROM "lines" ORDER BY rowid')
      .all()
      .filter((row) => String(row.message).includes(piece))
      .map((row) => JSON.parse(String(row.data ?? '{}')))
  } finally {
    log.close()
  }
}

const before = second ? JSON.parse(readFileSync(notes, 'utf8')) : undefined
const besideBefore = before ? Object.fromEntries(before.teams.map((team) => [team, besideOf(team)])) : {}

/** Under which name the files of those teams hold the title of an order, read with no engine: how many under each. */
function columns(teams) {
  const counted = { name: 0, title: 0 }
  for (const team of teams) {
    const db = new DatabaseSync(fileOf(team))
    try {
      const names = db.prepare("SELECT name FROM pragma_table_info('orders')").all().map((row) => row.name)
      counted[names.includes('name') ? 'name' : 'title']++
    } finally {
      db.close()
    }
  }
  return counted
}
const columnsBefore = before && what === 'pass' ? columns(before.teams) : undefined

const options = { dataFolder, mode: 'test', address: '*' }
const engine = createEngine({ port: 0, makers: { clock: () => clock } })
// After the kill in the pass, the app is opened with the bundle that came after the one of the pass.
const app = await engine.open(before && what === 'pass' ? after : bundle, options)
const addTeam = async (name) => idOf(await app.call('addTeam', { name }, system))
const addOrder = async (team, title) => idOf(await app.call('addOrder', { team, title }, system))

if (!before && what === 'open') {
  // Two files may be open: the third write closes the first file, and the fourth the second.
  const teams = []
  for (const n of [1, 2, 3, 4]) {
    teams.push(await addTeam(`team ${n}`))
    await addOrder(teams.at(-1), `first of ${n}`)
  }
  await addOrder(teams[2], 'second of 3')
  await addOrder(teams[3], 'second of 4')
  mkdirSync(join(dataFolder, 'tenants', '.tmp'), { recursive: true })
  writeFileSync(join(dataFolder, 'tenants', '.tmp', 'half.db'), 'half a copy')
  writeFileSync(notes, JSON.stringify({ teams }))
  writeSync(1, 'written\n')
  setInterval(() => undefined, 1000)
} else if (!before && what === 'pass') {
  const teams = []
  for (let i = 0; i < 30; i++) {
    teams.push(await addTeam(`team ${i}`))
    await addOrder(teams[i], `first of ${i}`)
    await addOrder(teams[i], `second of ${i}`)
  }
  await engine.close()
  // The next version names a column anew: every file is behind, and the pass brings them up one after another.
  const next = createEngine({ port: 0, makers: { clock: () => clock } })
  const renamed = await next.open(passed, options)
  for (;;) {
    const behind = (await listed(renamed)).filter((one) => one.behind).length
    if (behind === 0) {
      console.log('broken: the pass ended before the kill')
      process.exit(3)
    }
    if (behind < teams.length) break
    await new Promise((done) => setImmediate(done))
  }
  writeFileSync(notes, JSON.stringify({ teams }))
  writeSync(1, 'written\n')
  // The pass stands still from here on: the thread that hands its files over waits, until the program is killed.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
} else if (!before) {
  // The newest id of this start stands in a file that is closed, and that no start opens by itself.
  const team = await addTeam('team')
  const newest = await addOrder(team, 'the newest')
  advance(120_000)
  await new Promise((done) => setTimeout(done, 50))
  const open = (await listed(app)).filter((one) => one.open).length
  if (open) {
    console.log('broken: the file was not closed')
    process.exit(3)
  }
  writeFileSync(notes, JSON.stringify({ teams: [team], newest }))
  writeSync(1, 'written\n')
  setInterval(() => undefined, 1000)
} else if (what === 'open') {
  const files = await listed(app)
  const titles = {}
  for (const team of before.teams) {
    const rows = await app.read({ from: 'orders', of: team, sort: [{ by: 'createdAt' }, { by: 'id' }] }, { as: 'system' })
    titles[team] = rows.map((row) => row.title)
  }
  const told = {
    teams: before.teams,
    besideBefore,
    open: files.filter((one) => one.open).map((one) => one.id),
    read: logLines('were marked open').flatMap((data) => data.files ?? []),
    titles,
    temporary: existsSync(join(dataFolder, 'tenants', '.tmp', 'half.db')),
  }
  // The reads above opened the other files too: what stood open right after the start was asked before them.
  await engine.close()
  console.log(`told: ${JSON.stringify(told)}`)
} else if (what === 'pass') {
  let files = await listed(app)
  for (let i = 0; i < 2000 && files.some((one) => one.behind); i++) {
    await new Promise((done) => setTimeout(done, 5))
    files = await listed(app)
  }
  const names = {}
  for (const team of before.teams) {
    const rows = await app.read({ from: 'orders', of: team, sort: [{ by: 'createdAt' }, { by: 'id' }] }, { as: 'system' })
    names[team] = rows.map((row) => row.name)
  }
  await engine.close()
  const told = {
    teams: before.teams,
    before: columnsBefore,
    after: columns(before.teams),
    behind: files.filter((one) => one.behind).length,
    names,
  }
  console.log(`told: ${JSON.stringify(told)}`)
} else {
  const open = (await listed(app)).filter((one) => one.open).map((one) => one.id)
  const late = await addTeam('late')
  await engine.close()
  console.log(`told: ${JSON.stringify({ open, newest: before.newest, late })}`)
}
