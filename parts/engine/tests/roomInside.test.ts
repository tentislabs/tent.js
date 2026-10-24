import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const rooms = fileURLToPath(new URL('../rooms/', import.meta.url))
const inside = join(rooms, 'inside')
const parts = fileURLToPath(new URL('../../', import.meta.url))

// The files of the seam beside its folder that the room runtime may load: they import nothing else themselves.
const beside = ['crossing.ts', 'callables.ts', 'pure.ts', 'room.ts'].map((name) => join(rooms, name))

// The globals of the runtime that a file of the room runtime may not read.
const globalsOfRuntime = ['process', 'Buffer', 'require', 'setTimeout', 'setInterval', 'setImmediate', '__dirname']

/** Each import of a file that loads a module, as the runtime runs it with its types taken off: the name it imports. */
function importsOf(text: string): string[] {
  const code = stripTypeScriptTypes(text)
  const found: string[] = []
  for (const line of code.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.push(line[1])
  for (const line of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.push(line[1])
  for (const line of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)) found.push(line[1])
  return found
}

/** What is wrong with a file that the room runtime reaches, or nothing where it may reach it. */
function refused(target: string): string | undefined {
  if (target.startsWith(join(parts, 'core') + sep)) return undefined
  if (target.startsWith(join(parts, 'data') + sep))
    return target === join(parts, 'data', 'index.ts') ? 'the entry of data, where its own file is asked' : undefined
  if (target.startsWith(inside + sep) || beside.includes(target)) return undefined
  return 'no file the room runtime may reach'
}

/** Every file the room runtime reaches, by every import it makes and every import of those, and what is wrong. */
function reached(): { files: string[]; wrong: string[] } {
  const files = new Set<string>()
  const wrong: string[] = []
  const next = readdirSync(inside).map((name) => join(inside, name))
  for (let file = next.pop(); file !== undefined; file = next.pop()) {
    if (files.has(file)) continue
    files.add(file)
    for (const name of importsOf(readFileSync(file, 'utf8'))) {
      // The room runtime reaches `core` whole, which names a module of the runtime for pure work, as a fingerprint:
      // a host gives such a module, and the load below finds that none of it is used.
      if (name.startsWith('node:') && file.startsWith(join(parts, 'core') + sep)) continue
      if (!name.startsWith('.')) {
        wrong.push(`${relative(parts, file)} imports ${name}: a module of the runtime, or no file of the framework`)
        continue
      }
      const target = resolve(dirname(file), name)
      const why = refused(target)
      if (why) wrong.push(`${relative(parts, file)} imports ${relative(parts, target)}: ${why}`)
      else next.push(target)
    }
  }
  return { files: [...files], wrong }
}

test('[52-13] what the room runtime reaches, by every import and every import of those, holds no module of the runtime but what core names, and nothing but core, the files of data by their own names, its own folder and the crossing, the callables, pure.ts and room.ts; and its own files read no global of the runtime', () => {
  const { files, wrong } = reached()
  assert.ok(
    files.some((file) => file.startsWith(join(parts, 'data') + sep)),
    'the walk reached the face of db',
  )
  for (const file of files.filter((one) => one.startsWith(inside + sep) || beside.includes(one))) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const name of globalsOfRuntime)
      if (new RegExp(`(?<![\\w.'\`])${name}\\b`).test(code)) wrong.push(`${relative(parts, file)} reads ${name}`)
  }
  assert.deepEqual(wrong, [])
})

test('[52-13] the room runtime, loaded into a node:vm context that holds no global of the runtime, loads a version and answers a code query through ways that the test gives', () => {
  const ran = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', '--no-warnings', fileURLToPath(new URL('./insideAlone/load.mjs', import.meta.url))],
    { encoding: 'utf8', timeout: 60_000 },
  )
  assert.equal(ran.status, 0, ran.stderr)
  const told = JSON.parse(ran.stdout)
  assert.deepEqual(told.leaked, [], 'the context holds no global of the runtime')
  assert.equal(told.answer, 42, 'the code query answered through ways.db')
  assert.deepEqual(told.asked, [{ call: 7, db: 1, member: 'read', plan: { from: 'notes', count: true } }])
  assert.deepEqual(told.given, [], 'no module of the runtime that core names was used')
})
