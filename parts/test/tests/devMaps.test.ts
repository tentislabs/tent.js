import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { servedLive } from './living.ts'

test('[31-22] in development a module at its address with no fingerprint names its source map at its own mark, and the map is served as its module is: with no-store, and the map of an older mark by the version that holds it', async (t) => {
  const at = await servedLive(t, { mode: 'development' })
  /** The module of the screen file, as the module of the screen that the page loads imports it, and its source map. */
  const shown = async (): Promise<{ module: URL; map: URL; text: string; cache: string | null }> => {
    const html = await (await fetch(`${at.origin}/quote`)).text()
    const record = JSON.parse(
      /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}',
    )
    const screen = new URL(`/_t/b/${String(record.load.screen)}`, at.origin)
    const own = /from "\.\/(src\.screens\.tsx\.js\?v=([0-9a-f]{12}))"/.exec(await (await fetch(screen)).text())
    assert.ok(own, 'the module of the screen imports the module of its file at its mark')
    const module = new URL(own[1], screen)
    const code = await (await fetch(module)).text()
    const named = /\/\/# sourceMappingURL=(\S+)\n$/.exec(code)?.[1]
    assert.equal(named, `src.screens.tsx.js.map?v=${own[2]}`, 'the map is named at the mark of its module')
    const map = new URL(named, module)
    const answer = await fetch(map)
    assert.equal(answer.status, 200, map.href)
    return { module, map, text: await answer.text(), cache: answer.headers.get('cache-control') }
  }
  const before = await shown()
  assert.equal(before.cache, 'no-store')
  const file = join(at.projectFolder, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Quote {quote}', 'The quote is {quote}'))
  await at.app.switch(await at.app.add((await at.built()).bundleFolder))
  const after = await shown()
  assert.equal(after.cache, 'no-store')
  assert.notEqual(after.map.href, before.map.href)
  assert.notEqual(after.text, before.text, 'the map of the saved module holds other bytes')
  // A page that still runs the older module reads the map of its own mark, from the version that holds it.
  assert.equal(await (await fetch(before.map)).text(), before.text)
  assert.equal((await fetch(new URL('src.screens.tsx.js.map?v=000000000000', before.module))).status, 404)
})
