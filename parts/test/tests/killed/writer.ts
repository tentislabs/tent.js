// A program that is the writer of an app on many machines, to be killed under load, and that comes back as a
// reader of the machine that took over. Its readers run in the program of the test, and reach it over the network.
// Run: node writer.ts <bundle> <work folder>
// The first start of a round opens the writer's folder, waits for its near reader, writes without end, notes each
// answered write, and says `loaded`. The start after the kill opens the same folder with `reads`, and ends by itself
// once it follows the new writer. The test says in `turn.json` which folder is the writer's in which round.
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [bundle, work] = process.argv.slice(2)
const { createEngine } = await import('../../../engine/index.ts')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const read = (name) => JSON.parse(readFileSync(join(work, name), 'utf8'))
const plan = read('plan.json')

// A round that this program has ended is over: the next start waits until the test has named the next writer.
let turn = read('turn.json')
while (existsSync(join(work, `back.${turn.round}`))) {
  await sleep(20)
  turn = read('turn.json')
}
const { round, writer: mine } = turn
const other = mine === 'a' ? 'b' : 'a'
const address = (name) => `http://127.0.0.1:${plan.ports[name]}`
const readers = [plan.keys.near, { key: plan.keys.far, far: true }]
const dataFolder = join(work, mine)
const lostIn = () => readdirSync(dataFolder).filter((name) => name.startsWith('lost.'))

// What this program does is written into a file of its machine, which the test reads where a wait of it runs out:
// the output of a program that is killed reaches nobody.
const out = join(work, `out.${mine}.log`)
const say = (what) => appendFileSync(out, `${new Date().toISOString()} round ${round}, program ${process.pid}: ${what}\n`)
process.on('uncaughtException', (error) => {
  say(`ended by an error: ${error?.stack ?? error}`)
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  say(`ended by a promise that was refused: ${error?.stack ?? error}`)
  process.exit(1)
})
say(`started as ${existsSync(join(work, `loaded.${round}`)) ? `a reader of ${other}` : 'the writer'}, on the port ${plan.ports[mine]}`)

/**
 * Opens the folder of this machine on the port that it keeps, by what it is handed, and answers the engine with
 * the app. Where the port is still held, by the end of the program that was killed a moment ago or by another
 * program of this computer, it waits for the port and asks again: a machine that does not come back fails its round.
 */
async function opened(open) {
  for (;;) {
    const engine = createEngine({ port: plan.ports[mine] })
    try {
      return { engine, app: await open(engine) }
    } catch (error) {
      await engine.close().catch(() => undefined)
      say(`the opening was refused: ${error?.code} ${error?.message}`)
      if (error?.code !== 'EADDRINUSE') throw error
      await sleep(100)
    }
  }
}

if (!existsSync(join(work, `loaded.${round}`))) {
  const { app } = await opened((engine) =>
    engine.open(bundle, {
      dataFolder,
      mode: 'test',
      address: '*',
      own: address(mine),
      readers,
      insecure: true,
    }),
  )
  say(`opened as the writer, at ${JSON.stringify(app.at())}`)
  // A write is answered once the near reader holds it: the load begins when that reader is current.
  while (!app.machines().some((one) => one.role === 'reader' && !one.far && one.current)) await sleep(20)
  say(`its near reader is current: ${JSON.stringify(app.machines())}`)
  // The test says when the far reader follows this writer too, and knows the machines as it named them.
  while (!existsSync(join(work, `ready.${round}`))) await sleep(20)
  say('the test says that the far reader follows: the load begins')
  for (let i = 0; ; i++) {
    const title = `round ${round} write ${i}`
    await app.call('addOrder', { title }, { as: { kind: 'system' } })
    // Noted after the answer: a kill between the two loses the note, and never a write that was noted.
    appendFileSync(join(work, 'answered.log'), `${title}\n`)
    if (i === 4) {
      writeFileSync(join(work, `loaded.${round}`), '')
      say('under load: the kill is asked for')
      console.log('loaded')
    }
    if (i > 200) await sleep(500)
  }
} else {
  const before = lostIn()
  const { engine, app } = await opened((made) =>
    made.read({
      from: address(other),
      key: plan.keys.near,
      dataFolder,
      own: address(mine),
      readers,
      insecure: true,
      address: '*',
    }),
  )
  say(`opened with reads, role ${app.role}, at ${JSON.stringify(app.at())}`)
  // The old writer changes nothing until it reaches the writer of the newer epoch: then it follows it.
  let last = ''
  for (let turns = 0; ; turns++) {
    const took = existsSync(join(work, `took.${round}`)) ? read(`took.${round}`) : undefined
    // A current reader may still be a write behind its writer, within the time of `behind`: it follows once it also
    // holds every write it knows the writer holds.
    const writerAt = app.machines().find((one) => one.role === 'writer')?.n ?? Number.POSITIVE_INFINITY
    if (took && app.at().epoch === took.epoch && app.at().current && app.at().n >= writerAt) break
    // What it is and where it stands is written down when it changes, and every five seconds.
    const now = `role ${app.role}, at ${JSON.stringify(app.at())}, took ${JSON.stringify(took)}, machines ${JSON.stringify(app.machines())}`
    if (now !== last || turns % 250 === 0) say(`waits to follow the new writer: ${now}`)
    last = now
    await sleep(20)
  }
  const back = { round, n: app.at().n, lost: lostIn().filter((name) => !before.includes(name)) }
  await engine.close()
  say(`back: ${JSON.stringify(back)}`)
  console.log(`back: ${JSON.stringify(back)}`)
  writeFileSync(join(work, `back.${round}`), JSON.stringify(back))
  process.exit(0)
}
