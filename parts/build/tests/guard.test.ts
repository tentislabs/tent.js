import assert from 'node:assert/strict'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

const head = "import { screen } from 'tentjs/ui'\n"
const tail = (uses: string): string =>
  `\nexport const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => <span>{String(${uses})}</span> })\n`

/** Builds the project of the stubs with one helper and one screen in place of its screens, and the secrets it is handed. */
async function built(
  name: string,
  helper: string,
  screenFile: string,
  secrets: string[],
  mode: 'dev' | 'release',
  others: Record<string, string> = {},
) {
  const folder = copyOf('stubs', `guard-${name}`)
  for (const file of readdirSync(join(folder, 'screens'))) writeFileSync(join(folder, 'screens', file), '')
  writeFileSync(join(folder, 'helpers', 'held.ts'), helper)
  writeFileSync(join(folder, 'screens', 'way.tsx'), screenFile)
  // A file that is no source file is read by the builder as it lies there, with the line ends of its system.
  for (const [file, text] of Object.entries(others)) writeFileSync(join(folder, file), text)
  const made = await buildProject(folder, { for: mode, secrets })
  return { made, codes: made.findings.filter((one) => one.level === 'error').map((one) => one.code) }
}

// Values that the builder writes with an escape, or in another form than they were written in.
const values: Record<string, string> = {
  plain: 'sk_live_PLAIN-0123456789-abcdefghij',
  'a double quote': 'sk_live_"QUOTED"-0123456789-abcdef',
  'a single quote': "sk_live_'SINGLE'-0123456789-abcdef",
  'a backslash': 'sk_live_BACK\\SLASH\\0123456789-abcdef',
  'a tab': 'sk_live_TAB\tTAB-0123456789-abcdefgh',
  'a line break': '-----BEGIN KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END KEY-----',
  'the end of a script': 'sk_live_</script><script>-0123456789',
  'a backtick and a value sign': ['sk_live_`TICK`-$', '{NOT}-0123456789-ab'].join(''),
  'a letter of another alphabet': 'sk_live_GİZLİ-ŞİFRE-0123456789-abcdef',
}

test('[14-3] the guard finds a secret value however the builder writes it into a browser file: with a quote, a backslash, a line break or the end of a tag, in a release build and in a development build', async () => {
  for (const mode of ['release', 'dev'] as const)
    for (const [name, value] of Object.entries(values)) {
      const helper = `// A helper that imports neither side.\nexport const held: string = ${JSON.stringify(value)}\n`
      const screenFile = `${head}import { held } from '../helpers/held'\n${tail('held.length')}`
      const as = `${mode}-${name.replaceAll(' ', '-')}`
      const { made, codes } = await built(as, helper, screenFile, [value], mode)
      assert.deepEqual([...new Set(codes)], ['T3007'], `${name}, for ${mode}`)
      assert.equal(made.bundleFolder, '', `${name}, for ${mode}: no bundle is written`)
      // The same project with another value to search for builds: the guard finds what is there, and nothing else.
      const other = await built(`${as}-other`, helper, screenFile, ['sk_live_ANOTHER-VALUE-0123456789'], mode)
      assert.deepEqual(other.codes, [], `${name}, for ${mode}, searched for another value`)
    }
})

test('[14-3] the guard finds a secret value inside an address that holds its bytes in base 64', async () => {
  const value = values.plain
  for (const mode of ['release', 'dev'] as const) {
    const helper = `export const held: string = ${JSON.stringify(value)}\n`
    // The helper is asked for as an address: a small file is written into the code as its bytes in base 64.
    const screenFile = `${head}import at from '../helpers/held.ts?url'\n${tail('at')}`
    const { made, codes } = await built(`${mode}-as-an-address`, helper, screenFile, [value], mode)
    assert.deepEqual([...new Set(codes)], ['T3007'], mode)
    assert.equal(made.bundleFolder, '', mode)
  }
})

test('[14-3] the guard finds a key of several lines whichever line end the value and the code have', async () => {
  const lines = ['-----BEGIN KEY-----', 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'BKcwggSjAgEAAoIBAQC7', '-----END KEY-----']
  // The value as a file of this computer holds it, and the code as a file of the project holds it: each with each.
  for (const mode of ['release', 'dev'] as const)
    for (const [ofValue, valueEnd] of [
      ['n', '\n'],
      ['rn', '\r\n'],
      ['r', '\r'],
    ] as const)
      for (const [ofCode, codeEnd] of [
        ['n', '\n'],
        ['rn', '\r\n'],
      ] as const) {
        // The key stands between backticks, over several lines of the file.
        const helper = `// A helper that imports neither side.${codeEnd}export const held: string = \`${lines.join(codeEnd)}\`${codeEnd}`
        const screenFile = `${head}import { held } from '../helpers/held'\n${tail('held.length')}`
        const said = `the value with ${ofValue}, the code with ${ofCode}, for ${mode}`
        const { made, codes } = await built(
          `ends-${mode}-${ofValue}-${ofCode}`,
          helper,
          screenFile,
          [lines.join(valueEnd)],
          mode,
        )
        assert.deepEqual([...new Set(codes)], ['T3007'], said)
        assert.equal(made.bundleFolder, '', said)
      }
  // The same key in a helper of plain code, whose file holds the line ends of Windows: the builder reads it as it is.
  for (const mode of ['release', 'dev'] as const)
    for (const [ofValue, valueEnd] of [
      ['n', '\n'],
      ['rn', '\r\n'],
    ] as const) {
      const plain = `export const held = \`${lines.join('\r\n')}\`\r\n`
      const screenFile = `${head}import { held } from '../helpers/plain.js'\n${tail('held.length')}`
      const said = `plain code with rn, the value with ${ofValue}, for ${mode}`
      const value = lines.join(valueEnd)
      const { codes } = await built(`ends-plain-${mode}-${ofValue}`, '', screenFile, [value], mode, {
        'helpers/plain.js': plain,
      })
      assert.deepEqual([...new Set(codes)], ['T3007'], said)
      // And in a text file with those line ends, which a screen takes as its text.
      const asText = `${head}import held from './key.txt?raw'\n${tail('held.length')}`
      const taken = await built(`ends-text-${mode}-${ofValue}`, '', asText, [value], mode, {
        'screens/key.txt': lines.join('\r\n'),
      })
      assert.deepEqual(
        [...new Set(taken.codes)],
        ['T3007'],
        `a text file with rn, the value with ${ofValue}, for ${mode}`,
      )
    }
  // A key of other lines is not found in the same code.
  const helper = `export const held: string = \`${lines.join('\n')}\`\n`
  const screenFile = `${head}import { held } from '../helpers/held'\n${tail('held.length')}`
  const other = ['-----BEGIN KEY-----', 'ANOTHER-LINE-OF-ANOTHER-KEY-0123', '-----END KEY-----'].join('\r\n')
  assert.deepEqual((await built('ends-other', helper, screenFile, [other], 'release')).codes, [])
})
