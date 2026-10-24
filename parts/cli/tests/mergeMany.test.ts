import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../../check/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import { ada, describedNow } from './merging.ts'
import { copied } from './typed.ts'

/** A random number from a seed, so that the edits of a run can be made again. */
function drawn(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const put = (project: string, path: string, change: (text: string) => string): void => {
  const lies = join(project, path)
  writeFileSync(lies, change(readFileSync(lies, 'utf8')))
}

// Edits as a builder and a tool make them, each of which writes a word of its own that the merge must not lose.
const edits: ((project: string, word: string, draw: () => number) => void)[] = [
  (project, word) =>
    put(project, 'tables/orders.ts', (text) =>
      text.replace('    note:', `    ${word}: text({ optional: true }),\n    note:`),
    ),
  (project, word) =>
    put(project, 'tables/orders.ts', (text) =>
      text.replace(
        '    city: text({ optional: true }),\n',
        `    city: text({ optional: true }),\n    ${word}: number({ optional: true }),\n`,
      ),
    ),
  (project, word) => {
    mkdirSync(join(project, 'functions'), { recursive: true })
    writeFileSync(
      join(project, 'functions', `${word}.ts`),
      `import { query } from 'tentjs'\nimport { orders } from '../tables/orders'\n\nexport const ${word} = query('${word}', { access: 'signedIn', rows: orders.limit(5) })\n`,
    )
  },
  (project, word, draw) =>
    put(project, 'notes.md', (text) => {
      const lines = text.split('\n')
      const at = 2 + Math.floor(draw() * 5)
      lines[at] = `${lines[at]} ${word}`
      return lines.join('\n')
    }),
  (project, word) => put(project, 'notes.md', (text) => `${text}${word}\n`),
  (project, word) =>
    put(project, 'functions/orders.ts', (text) => text.replace(/padEnd\((\d+), '[^']*'\)/, `padEnd(8, '${word}')`)),
  (project, word) =>
    put(project, 'flows/follow.ts', (text) =>
      text.replace("    return 'done'", `    await step('${word}', () => '${word}')\n    return 'done'`),
    ),
  (project, word) => {
    mkdirSync(join(project, 'docs'), { recursive: true })
    writeFileSync(join(project, 'docs', `${word}.md`), `# ${word}\n`)
  },
  (project, word) =>
    put(project, 'functions/orders.ts', (text) =>
      text
        .replace("state: 'open' }", `state: 'open', note: '${word}' }`)
        .replace(/note: '[a-z0-9]+', note: /, 'note: '),
    ),
]

/** Every file of a project but those of the engine's own folder, as one text. */
function allText(project: string, at = ''): string {
  let found = ''
  for (const entry of readdirSync(join(project, at), { withFileTypes: true })) {
    const path = at ? `${at}/${entry.name}` : entry.name
    if (path === '.tent' || path === 'node_modules') continue
    if (entry.isDirectory()) found += allText(project, path)
    else found += readFileSync(join(project, path), 'utf8')
  }
  return found
}

/** Makes five edits on one side and records them with the description of the files, and answers the words they wrote. */
async function fiveEdits(
  history: History,
  project: string,
  side: string,
  round: number,
  draw: () => number,
): Promise<string[]> {
  const words: string[] = []
  for (let n = 0; n < 5; n++) {
    const word = `${side}${round}e${n}`
    edits[Math.floor(draw() * edits.length)](project, word, draw)
    words.push(word)
  }
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  const text = allText(project)
  // An edit may write over an earlier one of its own side: what the side holds at its end is what must arrive.
  return words.filter((word) => text.includes(word))
}

test('[40-4] two branches with 30 mixed edits each on a project: every clean merge passes the check, every clash is in the clash file, and nothing is lost', async (t) => {
  const seed = 20261015
  const draw = drawn(seed)
  let history: History | undefined
  t.after(() => history?.close())
  const project = copied(t, 'merge-many', 'merging')
  history = openHistory(join(project, '.tent'))
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  history.branch('side')
  const seen = { clean: 0, clashed: 0 }
  for (let round = 0; round < 6; round++) {
    history.switch(project, 'side', ada)
    const theirs = await fiveEdits(history, project, 'theirs', round, draw)
    history.switch(project, 'main', ada)
    const ours = await fiveEdits(history, project, 'ours', round, draw)
    const merged = history.merge(project, 'side', ada)
    const text = allText(project)
    for (const word of [...ours, ...theirs])
      assert.ok(text.includes(word), `seed ${seed}, round ${round}: ${word} is not lost`)
    if (merged.clashes.length) {
      seen.clashed++
      assert.ok(existsSync(join(project, 'tent.clash.ts')), `seed ${seed}, round ${round}: the clash file is written`)
      const clash = readFileSync(join(project, 'tent.clash.ts'), 'utf8')
      const numbered = clash.split('\n').filter((line) => /^\/\/ \d+\. /.test(line))
      assert.ok(numbered.length > 0, 'each clash has its numbered line')
      for (const [k, line] of numbered.entries()) assert.match(line, new RegExp(`^// ${k + 1}\\. `))
      // A person settles: ours is kept, and the clash file and what was kept beside a file go.
      rmSync(join(project, 'tent.clash.ts'))
      for (const left of history.list({ newest: 1 })[0].clashes ?? [])
        rmSync(join(project, `${left.name}.theirs`), { force: true })
      history.settle(project, ada)
    } else {
      seen.clean++
      const found = await checkProject(project)
      assert.deepEqual(
        found.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
        [],
        `seed ${seed}, round ${round}: a clean merge passes the check`,
      )
    }
    history.mark('now', { description: await describedNow(project) })
    // The side takes the merge, so the next round starts from one point.
    history.switch(project, 'side', ada)
    history.merge(project, 'main', ada)
    history.switch(project, 'main', ada)
  }
  assert.ok(seen.clean > 0, `seed ${seed}: some merges are clean`)
  assert.ok(seen.clashed > 0, `seed ${seed}: some merges clash`)
})
