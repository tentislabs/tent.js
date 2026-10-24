// Holds the packages of a tree against its file of borrowed parts.
// Run: node scripts/borrowed.mjs [folder]      Ends with 1 when a package stands in neither a row nor a cell.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const folder = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (file) => JSON.parse(readFileSync(join(folder, file), 'utf8'))

// The rows of the table whose head names the cell `Brings`: each row as the cells of that head.
const rows = []
let head = null
for (const line of readFileSync(join(folder, 'THIRD-PARTY.md'), 'utf8').replace(/\r\n/g, '\n').split('\n')) {
  if (!line.startsWith('|')) {
    head = null
    continue
  }
  const cells = line
    .slice(1, line.lastIndexOf('|'))
    .split('|')
    .map((cell) => cell.trim())
  if (!head) head = cells
  else if (head.includes('Brings') && !/^-+$/.test(cells[0]))
    rows.push(Object.fromEntries(head.map((name, k) => [name, cells[k] ?? ''])))
}
// The versions that the cells hold of each package they name.
const brought = new Map()
for (const row of rows)
  for (const match of row.Brings.matchAll(/`([^`]+)` (\S+) \(([^)]+)\)/g))
    brought.set(match[1], [...(brought.get(match[1]) ?? []), match[2]])

const found = []
const named = new Set()
const { dependencies, devDependencies, optionalDependencies } = json('package.json')
for (const [name, version] of Object.entries({ ...dependencies, ...devDependencies, ...optionalDependencies })) {
  named.add(name)
  const row = rows.find((one) => one.Part.includes(`\`${name}\``))
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version))
    found.push(`\`${name}\` ${version} of package.json is named at no exact version`)
  if (!row) found.push(`\`${name}\` ${version} of package.json has no row`)
  else if (row.Version !== version)
    found.push(`\`${name}\` ${version} of package.json has no row: the row of its name holds ${row.Version}`)
}

let held = 0
for (const [path, { version }] of Object.entries(json('package-lock.json').packages)) {
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
  // The tree itself stands in the lock under an empty path, and a package that is named has its row.
  if (!path || (named.has(name) && path === `node_modules/${name}`)) continue
  held++
  const versions = brought.get(name) ?? []
  if (versions.includes(version)) continue
  const other = versions.length ? `: a cell holds it as ${versions.join(' and ')}` : ''
  found.push(`\`${name}\` ${version} of the lock stands in no \`Brings\` cell${other}`)
}

if (found.length) {
  console.log(`${found.join('\n')}\n\n${found.length} found.`)
  process.exit(1)
}
console.log(`${named.size} packages with a row, and ${held} that they bring. Nothing found.`)
