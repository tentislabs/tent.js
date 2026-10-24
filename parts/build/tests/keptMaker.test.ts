import assert from 'node:assert/strict'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

/** The source maps under `server/` of a bundle, each read. */
const mapsOf = (bundle: string): { sources: string[] }[] =>
  readdirSync(join(bundle, 'server'))
    .filter((one) => one.endsWith('.map'))
    .map((one) => JSON.parse(readFileSync(join(bundle, 'server', one), 'utf8')))

test('[31-19] the modules that a development build keeps are kept under its maker: those that a build of other code made, whose maps name their sources the old way, are never read again', async () => {
  const folder = copyOf('options', 'kept-maker')
  const first = await buildProject(folder, { for: 'dev' })
  const maps = mapsOf(first.bundleFolder)
  assert.ok(maps.length > 0, 'a development build has the maps of its server modules')
  for (const map of maps)
    for (const source of map.sources) assert.ok(!source.startsWith('../'), `named from the project: ${source}`)
  // What was kept is made as a build of other code would have made it: its maps name each source from `dist/`,
  // and its key is that of another maker.
  const kept = join(folder, '.tent', 'cache', 'modules.dev.json')
  const held = JSON.parse(readFileSync(kept, 'utf8'))
  const key = JSON.parse(held.key)
  assert.equal(typeof key.maker, 'string', 'the key names the maker')
  for (const one of held.made)
    if (one.name.endsWith('.map')) {
      const map = JSON.parse(one.text)
      one.text = JSON.stringify({ ...map, sources: map.sources.map((source: string) => `../${source}`) })
    }
  writeFileSync(kept, JSON.stringify({ ...held, key: JSON.stringify({ ...key, maker: 'an older maker' }) }))
  rmSync(first.bundleFolder, { recursive: true, force: true })
  const second = await buildProject(folder, { for: 'dev' })
  for (const map of mapsOf(second.bundleFolder))
    for (const source of map.sources) assert.ok(!source.startsWith('../'), `read from what was kept: ${source}`)
})
