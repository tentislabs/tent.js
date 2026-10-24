import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

/** A text of JavaScript with every escape of a written text read, as the browser that runs the file reads it. */
const asRead = (text: string): string =>
  text.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, sign: string) => {
    if (sign.startsWith('u{')) return String.fromCodePoint(Number.parseInt(sign.slice(2, -1), 16))
    if (sign.length > 1) return String.fromCharCode(Number.parseInt(sign.slice(1), 16))
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }[sign] ?? sign
  })

// Secret values of a computer, as a secrets file may hold them: a password with a sign that a written text of
// JavaScript escapes, and a key of several lines.
const values: Record<string, string> = {
  plain: 'the-plain-value-of-this-computer-0123',
  'a double quote': 'pass"word-with-a-quote-0123456789',
  'a single quote': "pass'word-with-a-single-quote-0123",
  'a backslash': 'pass\\word-with-a-backslash-0123456',
  'a key of several lines': '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----',
  'a tab': 'pass\tword-with-a-tab-0123456789',
  'a letter of another alphabet': 'pässwört-with-other-letters-0123',
  'a dollar and a bracket': ['pass$', '{word}-with-a-dollar-0123456'].join(''),
  'the end of a tag': 'pass</word>-with-a-tag-0123456789',
  'the end of a script': 'pass</script>word-0123456789-abcdef',
}

/** A text with each text that it holds in base 64 opened beside it, as an address that carries its own bytes holds one. */
const opened = (text: string): string =>
  text +
  [...text.matchAll(/base64,([A-Za-z0-9+/=]+)/g)].map((one) => Buffer.from(one[1], 'base64').toString()).join(' ')

// The screen of each try: it imports the helper that holds the value, or asks for that helper as an address.
const screens = {
  imported:
    "import { screen } from 'tentjs/ui'\nimport { keyed } from '../helpers/keys'\n" +
    "export const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => <span>{keyed('x').trim()}</span> })\n",
  'asked for as an address':
    "import { screen } from 'tentjs/ui'\nimport at from '../helpers/keys.ts?url'\n" +
    "export const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => <span>{String(at)}</span> })\n",
}

test('[05-4.27] a secret value with a backslash, a quote, a line break or </script> in it, in a helper that a screen imports, and one in a helper that is asked for as an address, is T3007 in a release build and in a development build', async () => {
  const tries: [string, string, keyof typeof screens][] = [
    ...Object.entries(values).map(([name, value]): [string, string, keyof typeof screens] => [name, value, 'imported']),
    ['plain', values.plain, 'asked for as an address'],
    ['a backslash', values['a backslash'], 'asked for as an address'],
  ]
  const missed: string[] = []
  let found = 0
  for (const mode of ['release', 'dev'] as const)
    for (const [name, value, how] of tries) {
      const said = `${mode}, ${name}, ${how}`
      const folder = copyOf('attack-stubs', `attack-guard-${said.replaceAll(/[ ,]+/g, '-')}`)
      // The value stands in a helper of the browser's side: nothing keeps it out of the browser but the guard.
      writeFileSync(
        join(folder, 'helpers', 'keys.ts'),
        `export const keyed = (text: string): string => [text, ${JSON.stringify(value)}].join(' ')\n`,
      )
      writeFileSync(join(folder, 'screens', 'way.tsx'), screens[how])
      const made = await buildProject(folder, { for: mode, secrets: ['another-value-of-this-computer', value] })
      const codes = [...new Set(made.findings.filter((one) => one.level === 'error').map((one) => one.code))]
      // The guard found it: T3007 and nothing else, and no bundle.
      if (made.bundleFolder === '' && codes.length === 1 && codes[0] === 'T3007') {
        found++
        continue
      }
      // Where a bundle was written, the browser file that holds the value, as a browser reads the file, is named.
      const holding = (made.bundleFolder === '' ? [] : readdirSync(join(made.bundleFolder, 'browser'))).filter(
        (file) => {
          const text = opened(readFileSync(join(made.bundleFolder, 'browser', file), 'utf8'))
          return text.includes(value) || asRead(text).includes(value)
        },
      )
      missed.push(
        `${said}: ${made.bundleFolder === '' ? 'no bundle' : 'a bundle is written'}, with ${codes.join(' ') || 'no error'}` +
          holding.map((file) => `; browser/${file.replace(/\.[0-9a-f]{12}\./, '.')} holds the value`).join(''),
      )
    }
  assert.deepEqual(missed, [])
  assert.equal(found, tries.length * 2)
})
