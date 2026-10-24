import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { workFolder } from './apps.ts'

// The resizer that stands in for the one that is fetched: it answers bytes that name what it was asked.
const standIn: Record<string, string> = {
  'node_modules/sharp/package.json': '{ "name": "sharp", "version": "0.0.0", "main": "lib/index.js" }',
  'node_modules/sharp/lib/index.js': `module.exports = function sharp(input) {
  const asked = { width: 0, format: 'png', blurred: false }
  const chain = {
    rotate: () => chain,
    blur: () => ((asked.blurred = true), chain),
    resize: (o) => ((asked.width = typeof o === 'number' ? o : o.width), chain),
    avif: () => ((asked.format = 'avif'), chain),
    webp: () => ((asked.format = 'webp'), chain),
    png: () => ((asked.format = 'png'), chain),
    jpeg: () => ((asked.format = 'jpeg'), chain),
    gif: () => ((asked.format = 'gif'), chain),
    // A copy in a format of its own is smaller than one in the kind of the picture, as it mostly is.
    toBuffer: async () =>
      Buffer.from(asked.format + ' ' + asked.width + (asked.blurred ? ' blurred' : '') + (/avif|webp/.test(asked.format) ? '' : ' in its own kind')),
  }
  return chain
}
`,
}

/**
 * Makes the folder of the parts of an engine of one test, with the resizer standing in its place: a test that asks
 * the image door fetches nothing.
 */
export function partsWithResizer(t: TestContext): string {
  const folder = workFolder(t)
  const list: unknown = JSON.parse(readFileSync(new URL('../fetched.json', import.meta.url), 'utf8'))
  const line = Array.isArray(list) ? list.find((one) => Reflect.get(Object(one), 'name') === 'sharp') : undefined
  const place = join(folder, 'fetched', `sharp@${String(Reflect.get(Object(line), 'version'))}`)
  for (const [path, text] of Object.entries(standIn)) {
    mkdirSync(dirname(join(place, path)), { recursive: true })
    writeFileSync(join(place, path), text)
  }
  return folder
}
