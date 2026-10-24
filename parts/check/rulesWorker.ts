import { parentPort } from 'node:worker_threads'
import type { Source } from '../build/index.ts'
import { treeOfText } from '../build/index.ts'
import type { RulesAsked, RulesTold } from './rulesThread.ts'
import { rulesLoaded, rulesOver } from './rulesOver.ts'

// The thread of our rules. It holds the source of the project as the builds handed it: a file whose text did not
// change keeps its tree, so what a rule that reads one file found of it is kept too.
const held: Source = {}

const tell = (told: RulesTold): void => parentPort?.postMessage(told)

// The rules are loaded as the thread starts, while the session still builds: a rule that cannot be loaded fails the
// first build that is handed here, which loads it again.
rulesLoaded().catch(() => undefined)

parentPort?.on('message', (asked: RulesAsked) => {
  for (const [path, one] of Object.entries(asked.texts)) {
    const tree = one.tree ? treeOfText(path, one.text) : undefined
    held[path] = { file: one.file, text: one.text, ...(tree ? { tree } : {}) }
  }
  const paths = new Set(asked.paths)
  for (const path of Object.keys(held)) if (!paths.has(path)) delete held[path]
  // The source is handed to the rules in the order of the build, as a rule over the whole reads it.
  const source: Source = Object.fromEntries(asked.paths.flatMap((path) => (held[path] ? [[path, held[path]]] : [])))
  rulesOver({ description: asked.description, source }).then(
    (found) => tell({ n: asked.n, found }),
    (error: unknown) => tell({ n: asked.n, failed: String(error) }),
  )
})
