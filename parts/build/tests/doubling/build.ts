// A program that builds a project both ways, and says how it went and how much memory it took, as one line of JSON.
// Run: node --max-old-space-size=512 build.ts <project folder>
// It is a program of its own, so that a build which grows without end is this program's end and no other's. The
// builder works outside the memory that the runtime bounds, so the program looks at all that it holds twenty times
// a second, and ends itself with 3 once that passes the bound: a fault takes less than a second, and little memory.
import { buildProject } from '../../index.ts'

const bound = 700 * 1048576
const megabytes = () => Math.round(process.memoryUsage().rss / 1048576)
setInterval(() => {
  if (process.memoryUsage().rss < bound) return
  console.log(`said: ${JSON.stringify({ built: [], megabytes: megabytes(), ended: 'past the bound of its memory' })}`)
  process.exit(3)
}, 50).unref()

const [project] = process.argv.slice(2)
const said = []
for (const kind of ['dev', 'release']) {
  const built = await buildProject(project, { for: kind })
  const errors = built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`)
  const functions = built.description?.functions ?? {}
  said.push({ kind, errors, forms: Object.fromEntries(Object.entries(functions).map(([name, one]) => [name, one.form])) })
}
console.log(`said: ${JSON.stringify({ built: said, megabytes: megabytes() })}`)
