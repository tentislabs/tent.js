import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'

const parts = join(import.meta.dirname, '..', '..')

/** Every file of `parts/` by its path from there, written with `/`, but those of the seam and of a folder of tests. */
function files(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name)
      const path = relative(parts, full).split(sep).join('/')
      if (entry.isDirectory()) {
        if (entry.name === 'tests' || entry.name === 'node_modules' || path === 'engine/rooms') continue
        walk(full)
      } else if (/\.(ts|tsx|mjs|js|md|json|txt)$/.test(entry.name))
        found.push({ path, text: readFileSync(full, 'utf8') })
    }
  }
  walk(parts)
  return found
}

// The files outside the seam that start a program, a browser of the framework's own and never the app's code.
const browsers = new Set(['engine/shot/driven.ts', 'engine/shot/bidiBrowser.ts'])
// The one file outside the seam that loads a module by a path it computes: a part of the framework that is fetched
// at its first use, never the app's code.
const fetchedParts = new Set(['engine/borrowed/fetchedModule.ts'])

// The names of the ways beside the seam, each gone with it.
const names = [
  'loadModule',
  'runOf',
  'ruleOf',
  'pageCodeOf',
  'drawerOf',
  'carryHeld',
  'neededInEngine',
  'roomDb',
  'channelDb',
  'boxApp',
  'boxedFrom',
  'asleepAnswer',
]

test('[52-4] no call beside the seam: outside parts/engine/rooms/ nothing loads a module by a computed path, starts a program, or holds a name of the ways that are gone, and no file names --boxed', () => {
  const all = files()
  const found: string[] = []
  for (const { path, text } of all) {
    const part = path.split('/')[0] ?? ''
    const code = /\.(ts|tsx)$/.test(path)
    if (code && (part === 'engine' || part === 'workspaces') && !fetchedParts.has(path))
      for (const line of text.split('\n'))
        if (/\bimport\(\s*(?!['"`])\S/.test(line) || /\bimport\(\s*`[^`]*\$\{/.test(line))
          found.push(`${path}: an import( of a computed path: ${line.trim()}`)
    if (code && part === 'engine' && !browsers.has(path))
      for (const line of text.split('\n'))
        if (/\b(spawn|fork|execFile)\(/.test(line)) found.push(`${path}: starts a program: ${line.trim()}`)
    if (code && (part === 'engine' || part === 'workspaces' || part === 'cli'))
      for (const name of names) if (new RegExp(`\\b${name}\\b`).test(text)) found.push(`${path}: holds ${name}`)
    // What handed a request on to a box, and what started its engine, were of the workspaces.
    if (code && part === 'workspaces' && /\bhandedOn\b/.test(text)) found.push(`${path}: holds handedOn`)
    if (code && part === 'workspaces' && /\bserve\(/.test(text)) found.push(`${path}: holds serve of a Sandbox`)
    if (text.includes('--boxed')) found.push(`${path}: names --boxed`)
  }
  assert.deepEqual(found, [])
  // The search read the files it is about: the engine, the workspaces, the command line and the pages of the docs.
  for (const one of [
    'engine/createEngine.ts',
    'workspaces/opening.ts',
    'cli/commands/start.ts',
    'docs/pages/command.start.md',
  ])
    assert.ok(
      all.some(({ path }) => path === one),
      one,
    )
})

test('[52-4] the description is walked for its code by entriesOf alone: codeIn is gone from engine/code.ts, and needsCode reads the entries', () => {
  const code = readFileSync(join(parts, 'engine', 'code.ts'), 'utf8')
  assert.doesNotMatch(code, /\bcodeIn\b/, 'a second walk of the description for its code')
  const needs = code.slice(code.indexOf('export function needsCode'))
  assert.match(needs, /\bentriesOf\(/, 'needsCode reads what entriesOf found')
})
