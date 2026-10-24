// Holds that every check rule has its passing and its failing project, and a rule that is a folder one pair for each case.
// Run: node scripts/rules.mjs [folder]      Ends with 1 when a project is missing.
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const folder = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const rules = 'parts/check/rules'
const projects = 'parts/check/tests'
const kinds = { pass: 'passing', fail: 'failing' }

const found = []
let pairs = 0

/** Holds the two projects of one rule, or of one case of it, which lie under `path`. `rule` names it in a finding. */
function pair(rule, path) {
  pairs++
  for (const [name, kind] of Object.entries(kinds)) {
    const project = join(folder, path, name)
    if (!existsSync(project) || !readdirSync(project).length)
      found.push(`${rule} has no ${kind} project: ${path}/${name}/`)
  }
}

const entries = existsSync(join(folder, rules)) ? readdirSync(join(folder, rules), { withFileTypes: true }) : []
for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
  if (entry.isDirectory()) {
    for (const file of readdirSync(join(folder, rules, entry.name)).sort()) {
      const name = file.replace(/\.ts$/, '')
      if (name !== file) pair(`the rule ${entry.name}, in its case ${name},`, `${projects}/${entry.name}/${name}`)
    }
  } else if (entry.name.endsWith('.ts') && entry.name !== 'list.ts')
    pair(`the rule ${entry.name.slice(0, -'.ts'.length)}`, `${projects}/${entry.name.slice(0, -'.ts'.length)}`)
}

if (found.length) {
  console.log(`${found.join('\n')}\n\n${found.length} found in ${pairs} pairs of projects.`)
  process.exit(1)
}
console.log(`${pairs} pairs of projects. Nothing found.`)
