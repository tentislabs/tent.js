import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { agentsText, llmsText, pageNames, referenceText } from '../index.ts'

const root = join(import.meta.dirname, '..', '..', '..')
const maker = join(root, 'scripts', 'reference.mjs')
const file = join(root, 'parts', 'docs', 'reference.txt')

/** The names of the entries of a made list of a folder of the framework. */
const listed = (path: string): string[] =>
  [...readFileSync(join(root, path, 'list.ts'), 'utf8').matchAll(/name: '([^']+)'/g)].map((one) => one[1])

/** The lines of one part of the reference, under its heading. */
function partOf(text: string, heading: string): string[] {
  const lines = text.split('\n')
  const start = lines.indexOf(`## ${heading}`)
  assert.ok(start >= 0, `the reference has the part ${heading}`)
  const end = lines.findIndex((line, at) => at > start && line.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

/** How many lines of a list begin as a pattern says. */
const counted = (lines: string[], begins: RegExp): number => lines.filter((line) => begins.test(line)).length

/** A name as it stands inside a pattern. */
const quoted = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('[15-8] the reference names every word with its options, every hook, every tag, every command and every code of this version, each once, and a thing with no page fails the run', () => {
  const text = referenceText()
  const owed: string[] = JSON.parse(readFileSync(join(root, 'parts', 'docs', 'owed.json'), 'utf8'))
  const words = partOf(text, 'Words')
  for (const word of owed.filter((one) => one.startsWith('word.')).map((one) => one.slice(5)))
    assert.equal(counted(words, new RegExp(`^${quoted(word)}[(:]`)), 1, `the word ${word}`)
  // Each option stands once, under its word, with its type.
  for (const line of owed.filter((one) => one.startsWith('option.'))) {
    const [, word, option] = line.split('.')
    const start = words.findIndex((one) => new RegExp(`^${quoted(word)}[(:]`).test(one))
    const end = words.findIndex((one, at) => at > start && !one.startsWith('  '))
    const under = words.slice(start + 1, end < 0 ? undefined : end)
    assert.equal(counted(under, new RegExp(`^  ${quoted(option)}\\??: `)), 1, `the option ${option} of ${word}`)
  }
  const hooks = partOf(text, 'Hooks')
  for (const hook of listed('parts/screens/hooks')) assert.equal(counted(hooks, new RegExp(`^${hook}\\(`)), 1, hook)
  const tags = partOf(text, 'Tags')
  for (const tag of listed('parts/screens/tags')) assert.equal(counted(tags, new RegExp(`^<${tag}[ >]`)), 1, tag)
  const commands = partOf(text, 'Commands')
  for (const entry of listed('parts/cli/commands')) {
    // The file of a folder that bears the folder's name is the command of that one word.
    const [first, second] = entry.split('/')
    const name = second === undefined || second === first ? first : `${first} ${second}`
    // After the words of the command come its flags, its comment, or nothing.
    assert.equal(counted(commands, new RegExp(`^tent ${quoted(name)}( \\[| --| //|$)`)), 1, `tent ${name}`)
  }
  assert.match(commands.join('\n'), /^tent build \[--out <text>\] \[--dev\] \/\/ /m)
  const codes = partOf(text, 'Codes')
  for (const page of pageNames().filter((one) => one.startsWith('code.')))
    assert.equal(counted(codes, new RegExp(`^${page.slice(5)} `)), 1, page)
  // Each line says the rule of its thing by the first sentence of its page.
  assert.match(words.join('\n'), /^query\(name: string, o: QueryOptions[^)]*\) \/\/ A read of the app's data\.$/m)
  assert.match(codes.join('\n'), /^T9106 edit-not-found \/\/ /m)
  // A word whose page is not there, as when it was never written, fails the making of the reference, naming it.
  const made = spawnSync(process.execPath, [maker, root, '--without', 'word.table'], { encoding: 'utf8' })
  assert.equal(made.status, 1)
  assert.match(made.stderr, /word\.table/)
})

test('[15-8] no line of the reference is written by hand, the docs answer the file of the package, and the reference is below 72 kB', () => {
  const kept = readFileSync(file, 'utf8')
  const made = spawnSync(process.execPath, [maker, root], { encoding: 'utf8', maxBuffer: 1 << 24 })
  assert.equal(made.status, 0, made.stderr)
  assert.equal(made.stdout, kept, 'the file is the reference that the types and the lists make now')
  assert.equal(referenceText(), kept)
  const size = Buffer.byteLength(kept)
  assert.ok(size < 72 * 1024, `the reference is ${size} bytes`)
})

test('[15-8] AGENTS.md ends by naming the reference, and llms.txt is its text with the addresses of the reference and of the pages in place of the commands that read them', () => {
  const agents = agentsText()
  const last = agents.trimEnd().split('\n').at(-1) ?? ''
  assert.match(last, /`tent docs --reference`/)
  assert.match(last, /reference\.txt/)
  const llms = llmsText()
  assert.doesNotMatch(llms, /tent docs/)
  assert.match(llms, /https:\/\/tentjs\.com\/docs\/reference\.txt/)
  assert.match(llms, /https:\/\/tentjs\.com\/docs\/T1003/)
  assert.match(llmsText({ site: 'https://docs.example' }), /https:\/\/docs\.example\/reference\.txt/)
  // Everything else is the text of AGENTS.md as it stands.
  assert.equal(
    llms
      .split('\n')
      .filter((line) => !line.includes('tentjs.com'))
      .join('\n'),
    agents
      .split('\n')
      .filter((line) => !line.includes('tent docs'))
      .join('\n'),
  )
})
