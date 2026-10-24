// Makes the list of each folder that has one, from the files that lie in the folder, and the reference of the docs.
// Run: node scripts/lists.mjs [folder] [--main]      With --main it ends with 1 where a list differs from the one it makes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { folders, pages } from './listFolders.mjs'
import { referenceOf } from './reference.mjs'

const words = process.argv.slice(2)
const main = words.includes('--main')
const folder = words.find((word) => !word.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '..')

const code = /\.tsx?$/
const page = /\.md$/

// The order of the names is that of the numbers of their letters, which is the same on the three systems.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Answers the entries of the list of a folder: each file of it, and each file of a folder inside it. */
function entries(path, ending) {
  const found = []
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const file of readdirSync(join(folder, path, entry.name)))
        if (ending.test(file))
          found.push({ name: `${entry.name}/${file.replace(ending, '')}`, file: `${entry.name}/${file}` })
    } else if (ending.test(entry.name) && entry.name !== 'list.ts')
      found.push({ name: entry.name.replace(ending, ''), file: entry.name })
  }
  return found.sort(byName)
}

/** Answers the text of a list, laid out as the formatter lays it out. */
function listOf(path) {
  const isPages = path === pages
  const lines = entries(path, isPages ? page : code).map(({ name, file }) => {
    const second = isPages ? `file: '${file}'` : `load: () => import('./${file}')`
    const line = `{ name: '${name}', ${second} }`
    return line.length + 3 > 120 ? `{\n    name: '${name}',\n    ${second},\n  }` : line
  })
  if (!lines.length) return 'export const list = []\n'
  const one = `export const list = [${lines[0]}]`
  if (lines.length === 1 && one.length <= 120 && !lines[0].includes('\n')) return `${one}\n`
  return `export const list = [\n${lines.map((line) => `  ${line},\n`).join('')}]\n`
}

const differs = []
let made = 0
for (const path of folders) {
  if (!existsSync(join(folder, path))) continue
  const file = join(folder, path, 'list.ts')
  const text = listOf(path)
  made++
  if (existsSync(file) && readFileSync(file, 'utf8') === text) continue
  differs.push(`${path}/list.ts`)
  // A run on main holds the joined list against the one it makes, and leaves the joined one as it is.
  if (!main) writeFileSync(file, text)
}

// The reference of the docs is made from the types and these lists, and lies beside the pages as a file.
const reference = 'parts/docs/reference.txt'
if (existsSync(join(folder, 'parts/docs/owed.json')) && existsSync(join(folder, 'parts/entries.json'))) {
  const text = referenceOf(folder)
  made++
  const file = join(folder, reference)
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
    differs.push(reference)
    if (!main) writeFileSync(file, text)
  }
}

if (main && differs.length) {
  console.log(`${differs.map((file) => `${file}  the joined list differs from the list of its folder`).join('\n')}`)
  console.log(`\n${differs.length} found in ${made} lists.`)
  process.exit(1)
}
console.log(`${made} lists.${differs.map((file) => `\n${file}  made anew`).join('')}`)
