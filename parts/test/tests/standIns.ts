import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { closing } from './projects.ts'

/** The version of a part that the list of the engine pins. */
function pinnedOf(name: string): string {
  const list: unknown = JSON.parse(readFileSync(new URL('../../engine/fetched.json', import.meta.url), 'utf8'))
  const line = Array.isArray(list) ? list.find((one) => Reflect.get(Object(one), 'name') === name) : undefined
  const version: unknown = Reflect.get(Object(line), 'version')
  if (typeof version !== 'string') throw new Error(`fetched.json pins no part ${name}`)
  return version
}

/**
 * Lays a part that stands in for a fetched one where the engine looks for it, in a runner's folder of the test that
 * `TENT_HOME` names until the test ends: so nothing is fetched. Each file is a path inside the part and its text.
 */
export function standIn(t: TestContext, name: string, files: Record<string, string>): void {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const home = mkdtempSync(join(all, 'parts-'))
  closing(t, () => rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const place = join(home, 'fetched', `${name}@${pinnedOf(name)}`)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(place, path)), { recursive: true })
    writeFileSync(join(place, path), text)
  }
  const before = process.env.TENT_HOME
  process.env.TENT_HOME = home
  t.after(() => {
    if (before === undefined) delete process.env.TENT_HOME
    else process.env.TENT_HOME = before
  })
}

/**
 * The resizer that stands in for `sharp`: it answers, for any picture, a few bytes that name the kind and the width
 * it was asked for, so a test sees what the engine asked of it.
 */
export const resizerStandIn: Record<string, string> = {
  'node_modules/sharp/package.json': '{ "name": "sharp", "version": "0.0.0", "main": "lib/index.js" }',
  'node_modules/sharp/lib/index.js': `module.exports = function sharp(input) {
  const asked = { width: 0, format: 'png' }
  const chain = {
    rotate: () => chain,
    blur: () => chain,
    resize: (o) => ((asked.width = typeof o === 'number' ? o : o.width), chain),
    avif: () => ((asked.format = 'avif'), chain),
    webp: () => ((asked.format = 'webp'), chain),
    png: () => ((asked.format = 'png'), chain),
    jpeg: () => ((asked.format = 'jpeg'), chain),
    gif: () => ((asked.format = 'gif'), chain),
    // A copy in a format of its own is smaller than one in the kind of the picture, as it mostly is.
    toBuffer: async () =>
      Buffer.from(asked.format + ' ' + asked.width + (/avif|webp/.test(asked.format) ? '' : ' of ' + Buffer.from(input).length)),
  }
  return chain
}
`,
}

/**
 * The reader of PDF files that stands in for `unpdf`: a page of its files is what stands before each \`%%EOP\`, so a
 * test writes the pages it wants read.
 */
export const pdfStandIn: Record<string, string> = {
  'node_modules/unpdf/package.json':
    '{ "name": "unpdf", "version": "0.0.0", "type": "module", "exports": { ".": { "default": "./dist/index.mjs" } } }',
  'node_modules/unpdf/dist/index.mjs': `export async function extractText(data, o) {
  const pages = Buffer.from(data).toString('latin1').split('%%EOP').slice(0, -1).map((one) => one.replace(/^%PDF-[\\d.]+\\s*/, '').trim())
  return { totalPages: pages.length, text: o && o.mergePages ? pages.join('\\n') : pages }
}
`,
}
