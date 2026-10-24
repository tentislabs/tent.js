// Holds the pages of the docs against what is built: each thing that is owed a page has one, no page stands alone,
// and every page has the shape of its kind.
// Run: node scripts/pages.mjs [folder]      Ends with 1 when it finds something.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { wrongShape } from './page-shape.mjs'

const folder = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const pages = 'parts/docs/pages'
const owed = 'parts/docs/owed.json'
// The folders whose list holds what is owed a page, each with the kind of that page.
const listed = {
  'parts/cli/commands': 'command',
  'parts/screens/hooks': 'hook',
  'parts/screens/tags': 'tag',
  'parts/engine/handles': 'handle',
}

const found = []
// Each page that is asked for, by its name without its ending, with what asks for it.
const asked = new Map()

/** Answers the `.ts` and `.tsx` files under a folder, each by its path from the root of the tree, but for a `tests/` folder. */
function codeFiles(path, files = []) {
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    const below = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        codeFiles(below, files)
    } else if (/\.tsx?$/.test(entry.name) && below !== 'parts/core/codes.ts') files.push(below)
  }
  return files
}

/** Walks the tree of a file, and answers every text that the code holds in quotes. */
function strings(node, list = []) {
  if (Array.isArray(node)) for (const one of node) strings(one, list)
  else if (node && typeof node === 'object') {
    if (node.type === 'Literal' && typeof node.value === 'string') list.push(node.value)
    if (node.type === 'TemplateElement') list.push(node.value.cooked ?? node.value.raw)
    for (const value of Object.values(node)) strings(value, list)
  }
  return list
}

if (existsSync(join(folder, 'parts'))) {
  for (const file of codeFiles('parts').sort()) {
    const { program, errors } = parseSync(file, readFileSync(join(folder, file), 'utf8'))
    for (const error of errors) found.push(`${file}  the reader of source cannot read the file: ${error.message}`)
    for (const text of strings(program))
      for (const [code] of text.matchAll(/\bT\d{4}\b/g))
        if (!asked.has(`code.${code}`)) asked.set(`code.${code}`, `${file} names the code in a string`)
  }

  for (const [path, kind] of Object.entries(listed)) {
    if (!existsSync(join(folder, path))) continue
    if (!existsSync(join(folder, path, 'list.ts'))) {
      found.push(`${path}/list.ts  the folder has no list`)
      continue
    }
    // An entry that is a folder has one page, under the name of the folder.
    for (const [, name] of readFileSync(join(folder, path, 'list.ts'), 'utf8').matchAll(/name: '([^'/]+)[^']*'/g))
      asked.set(`${kind}.${name}`, `${path}/list.ts holds the entry`)
  }

  if (!existsSync(join(folder, owed))) found.push(`${owed}  the file of the owed pages is not there`)
  else {
    const lines = JSON.parse(readFileSync(join(folder, owed), 'utf8'))
    for (const [k, line] of lines.entries()) {
      if (k && lines[k - 1] > line)
        found.push(`${owed}  "${line}" stands after "${lines[k - 1]}", and the lines stand in the order of their names`)
      if (/^(?:word\.[^.]+|option\.[^.]+\.[^.]+|adapter\.[^.]+)$/.test(line)) asked.set(line, `${owed} holds the line`)
      else found.push(`${owed}  "${line}" is no word, no option of a word and no adapter`)
    }
  }
}

const there = existsSync(join(folder, pages))
  ? readdirSync(join(folder, pages))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length))
      .sort()
  : []
for (const [name, why] of asked)
  if (!there.includes(name)) found.push(`${pages}/${name}.md  there is no such page: ${why}`)
for (const name of there) {
  if (!asked.has(name) && !name.startsWith('topic.')) found.push(`${pages}/${name}.md  a page that nothing asks for`)
  // Every page is held to the shape of its kind, which is the word before the first point of its name.
  const [kind, of] = [name.slice(0, name.indexOf('.')), name.slice(name.indexOf('.') + 1)]
  for (const words of wrongShape(kind, of, readFileSync(join(folder, pages, `${name}.md`), 'utf8')))
    found.push(`${pages}/${name}.md  ${words}`)
}

if (found.length) {
  console.log(`${found.join('\n')}\n\n${found.length} found.`)
  process.exit(1)
}
console.log(`${asked.size} pages asked for, ${there.length} pages. Nothing found.`)
