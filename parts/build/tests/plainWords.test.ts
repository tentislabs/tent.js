import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { sweptPageCode } from '../pageCode.ts'
import { copyOf } from './projects.ts'

// The sign that starts a color of a terminal, written by its number so that this file holds none.
const escape = String.fromCharCode(27)

test('[14-10@5] where the builder fails, the words of a finding hold no color of a terminal: for a screen file and for a backend file that are run', async () => {
  const head = "import { useState } from 'react'\nimport { screen } from 'tentjs/ui'\n"
  const ways: Record<string, Record<string, string>> = {
    // A screen file that is run, since its view holds a hook, and that names a file which is not there.
    'a screen file': {
      'screens/way.tsx': `${head}import { gone } from '../helpers/gone'\nexport const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => { const [n] = useState(0); return <span>{String(gone)}{n}</span> } })\n`,
    },
    // A backend file that is run, since its action is code, and that names a file which is not there.
    'a backend file': {
      'functions/more.ts':
        "import { action } from 'tentjs'\nimport { gone } from './gone'\nexport const more = action('more', { access: 'anyone', run: async () => String(gone) })\n",
    },
  }
  for (const [name, files] of Object.entries(ways)) {
    const folder = copyOf('stubs', `plain-words-${name.replaceAll(' ', '-')}`)
    for (const file of readdirSync(join(folder, 'screens'))) writeFileSync(join(folder, 'screens', file), '')
    for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text)
    const made = await buildProject(folder, { for: 'release' })
    const errors = made.findings.filter((one) => one.level === 'error')
    assert.ok(errors.length > 0, `${name}: the build fails`)
    // The builder's own words are there, so the failure was its own, and they hold no sign of a color.
    assert.ok(
      errors.some((one) => /gone/.test(one.message)),
      `${name}: ${errors.map((one) => one.message).join(' | ')}`,
    )
    for (const one of errors) {
      const whole = JSON.stringify(one)
      assert.equal(one.message.includes(escape), false, `${name}: ${JSON.stringify(one.message)}`)
      assert.equal(/\\u001b|\[\d+m/.test(whole), false, `${name}: ${whole}`)
    }
  }
})

test('[31-14] of the folders of the page code that the framework made from its sources, the newest two are kept, and a folder that is being made is left alone', () => {
  const all = join(process.cwd(), 'results', 'build')
  mkdirSync(all, { recursive: true })
  const kept = mkdtempSync(join(all, 'page-code-'))
  try {
    // Five folders that were made, each a day after the one before, and one that another program is making.
    const day = 86400
    const names = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee']
    for (const [k, name] of names.entries()) {
      mkdirSync(join(kept, name))
      writeFileSync(join(kept, name, 'page.json'), '{}')
      utimesSync(join(kept, name), 1_700_000_000 + k * day, 1_700_000_000 + k * day)
    }
    mkdirSync(join(kept, 'ffff.4242.1700000000000'))
    utimesSync(join(kept, 'ffff.4242.1700000000000'), 1_600_000_000, 1_600_000_000)
    // The one in use is kept whatever its age: here the oldest.
    sweptPageCode(kept, 'aaaa')
    assert.deepEqual(readdirSync(kept).sort(), ['aaaa', 'eeee', 'ffff.4242.1700000000000'])
    // With the newest in use, the one before it stays beside it.
    for (const name of names) {
      if (existsSync(join(kept, name))) continue
      mkdirSync(join(kept, name))
      utimesSync(join(kept, name), 1_700_000_000 + names.indexOf(name) * day, 1_700_000_000 + names.indexOf(name) * day)
    }
    sweptPageCode(kept, 'eeee')
    assert.deepEqual(readdirSync(kept).sort(), ['dddd', 'eeee', 'ffff.4242.1700000000000'])
    // A folder that holds nothing more to take away is left as it is.
    sweptPageCode(kept, 'eeee')
    assert.deepEqual(readdirSync(kept).sort(), ['dddd', 'eeee', 'ffff.4242.1700000000000'])
  } finally {
    rmSync(kept, { recursive: true, force: true })
  }
})
