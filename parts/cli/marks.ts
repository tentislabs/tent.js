import { relative } from 'node:path'
import { beforeEach } from 'node:test'
import { testMark } from './marked.ts'

// Loaded into the program of each test file of an app before the file itself. The runner tells of what a file
// wrote out and of how its tests ended apart, and not which test wrote what: so each test says its name on both
// sides before it begins, and `tent test` reads by those lines what a test that failed wrote.
beforeEach((t) => {
  // What the test touches is noted under its file and its name, which `tent test` keeps for `tent impact`.
  const file = relative(process.cwd(), t.filePath ?? '').replaceAll('\\', '/')
  process.env.TENT_TEST = `${file}: ${t.name}`
  process.stdout.write(`${testMark}${t.name}\n`)
  process.stderr.write(`${testMark}${t.name}\n`)
})
