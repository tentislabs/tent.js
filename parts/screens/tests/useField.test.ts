import assert from 'node:assert/strict'
import { test } from 'node:test'
import { change, number, text } from '../../core/index.ts'
import { createElement } from '../borrowed/react.ts'
import { Form, screen, useField } from '../index.ts'
import { described, drawingOf, drawn } from './drawn.ts'

const rate = change('rate', {
  access: 'anyone',
  input: {
    stars: number({ min: 1, max: 5, whole: true, label: 'How many stars', help: 'One to five' }),
    note: text({ optional: true }),
  },
  run: () => null,
})

/** A control of the builder's own: it says what the form told it of its field. */
function Stars(o: { name: string }) {
  const field = useField(o.name)
  return createElement(
    'output',
    { 'data-name': o.name },
    JSON.stringify({
      value: field.value ?? null,
      error: field.error ?? null,
      invalid: field.invalid,
      busy: field.busy,
      required: field.required,
      label: field.label,
      help: field.help ?? null,
      kind: Object(field.type).kind ?? null,
    }),
  )
}

/** Draws a screen that is code, whose view is the one function, and answers what each control of the builder's own said. */
async function said(view: () => unknown): Promise<Record<string, Record<string, unknown>>> {
  const definition = screen('coded', { path: '/coded', access: 'anyone', view: () => null })
  const description = described([rate, definition])
  const html = drawingOf(
    (await drawn(description, 'coded', { views: { coded: { name: 'coded', kind: 'screen', view } } })).html,
  )
  const found: Record<string, Record<string, unknown>> = {}
  for (const one of html.matchAll(/<output data-name="([^"]+)">([^<]*)<\/output>/g))
    found[one[1]] = JSON.parse(one[2].replace(/&quot;/g, '"'))
  return found
}

const call = { definition: 'rate', kind: 'change', input: Object(rate).input }

test('[32-15] a component that calls useField inside a Form is a field of that form: it is handed its value, its type, and the label, the help words and whether it is required from the type', async () => {
  const fields = await said(() =>
    createElement(
      Form,
      { call, values: { stars: 4 } },
      createElement(Stars, { name: 'stars' }),
      createElement(Stars, { name: 'note' }),
    ),
  )
  assert.deepEqual(fields.stars, {
    value: 4,
    error: null,
    invalid: false,
    busy: false,
    required: true,
    label: 'How many stars',
    help: 'One to five',
    kind: 'number',
  })
  // A field with no label of its type is labelled by its name turned into words, and one that is optional is not required.
  assert.deepEqual(
    [fields.note.label, fields.note.required, fields.note.value, fields.note.kind],
    ['Note', false, null, 'text'],
  )
})

test('[32-15] a name that the input of the function does not have holds nothing, and outside a Form the hook fails', async () => {
  const fields = await said(() => createElement(Form, { call }, createElement(Stars, { name: 'missing' })))
  assert.deepEqual([fields.missing.value, fields.missing.kind, fields.missing.required], [null, null, false])
  await assert.rejects(
    said(() => createElement(Stars, { name: 'stars' })),
    /`useField` is called inside a `Form`/,
  )
})
