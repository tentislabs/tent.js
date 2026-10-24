import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'

test('[32-10] [21-16] on live data robots.txt lets everything be read and names the sitemap', async () => {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'robots-live-'))
  const folder = join(work, 'indexed')
  cpSync(join(import.meta.dirname, 'indexed'), folder, { recursive: true })
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    const dataFolder = join(work, 'data')
    await engine.open(made.bundleFolder, { dataFolder, mode: 'live' })
    const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
    const answer = await fetch(`http://localhost:${port}/robots.txt`)
    assert.equal(answer.status, 200)
    assert.equal(await answer.text(), `User-agent: *\nAllow: /\nSitemap: http://localhost:${port}/sitemap.xml\n`)
  } finally {
    await engine.close()
    rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
