import assert from 'node:assert/strict'
import { test } from 'node:test'
import { markedLines, typeCheck } from './typed.ts'

test('[14-9@5] the type checker refuses a screen file that takes its words from the backend side, and a backend file that takes its words from the screen side', () => {
  const files = {
    'screens/orders.tsx': [
      "import { screen } from 'tentjs' // refused",
      "import { component, read } from 'tentjs' // refused",
      "import { text } from 'tentjs/ui'",
      '',
      "export const ordersScreen = screen('ordersScreen', { path: '/', access: 'anyone', view: () => 'Orders' })",
      'export const others = [component, read, text]',
      '',
    ].join('\n'),
    'functions/orders.ts': [
      "import { query } from 'tentjs/ui' // refused",
      "import { change, action, table } from 'tentjs/ui' // refused",
      // No screen file can ask for a secret: the screen side does not give the word.
      "import { secret, secrets, settings, mail, files } from 'tentjs/ui' // refused",
      "import { number, role, anyone } from 'tentjs/ui'",
      '',
      'export const all = [query, change, action, table, secret, secrets, settings, mail, files, number, role, anyone]',
      '',
    ].join('\n'),
    // Each side gives its own words, and the types and the rule helpers are given by both.
    'screens/fine.tsx': [
      "import { anyone, number, read, role, screen, text } from 'tentjs/ui'",
      "import type { Finding } from 'tentjs'",
      '',
      "export const fineScreen = screen('fineScreen', { path: '/fine', access: role('staff'), view: () => 'Fine' })",
      'export const all = [anyone, number, read, text]',
      'export type Found = Finding',
      '',
    ].join('\n'),
    'functions/fine.ts': [
      "import { number, query, role, text } from 'tentjs'",
      '',
      "export const fine = query('fine', { access: role('staff'), input: { n: number(), t: text() }, run: () => 1 })",
      '',
    ].join('\n'),
  }
  const reported = typeCheck('sides', files)
  for (const [file, text] of Object.entries(files)) {
    const lines = [...new Set(reported.filter((one) => one.file.endsWith(file)).map((one) => one.line))]
    assert.deepEqual(
      lines,
      markedLines(text),
      `${file}: ${JSON.stringify(reported.filter((one) => one.file.endsWith(file)))}`,
    )
  }
  for (const one of reported) assert.match(one.words, /has no exported member/, one.words)
})
