// A program that is killed while the next version of an app backfills its rows, and started again until it ends.
// Each start opens the version that holds the backfills, which run as it opens, and says what every row holds,
// as one line of JSON.
// Run: node migrate.ts <the bundle of the version> <data folder> <the ids of the teams, as JSON>
const [bundle, dataFolder, teamsText] = process.argv.slice(2)
const teams = JSON.parse(teamsText)
const system = { as: { kind: 'system' } }
const { createEngine } = await import('../../../engine/index.ts')

console.log('opening')
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const people = await app.read({ from: 'people' }, system)
const tasks = []
for (const team of teams) tasks.push(...(await app.read({ from: 'tasks', of: team }, system)))
const runs = [...new Set([...people, ...tasks].map((row) => row.runs))].sort()
console.log(`told: ${JSON.stringify({ people: people.length, tasks: tasks.length, runs })}`)
await engine.close()
process.exit(0)
