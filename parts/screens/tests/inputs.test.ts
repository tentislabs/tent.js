import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boolean, change, choice, date, day, file, json, link, list, number, object, text } from '../../core/index.ts'
import { createElement } from '../borrowed/react.ts'
import type { InputProps } from '../index.ts'
import { Form, screen, useField } from '../index.ts'
import { described, drawingOf, drawn, unescaped } from './drawn.ts'

const every = change('every', {
  access: 'anyone',
  input: {
    name: text({ min: 2, max: 40, label: 'Your name', help: 'As on your card' }),
    secret: text({ secret: true }),
    note: text({ lines: 'many', optional: true }),
    count: number({ min: 1, max: 9, whole: true }),
    share: number({ optional: true }),
    agreed: boolean(),
    at: date(),
    on: day(),
    size: choice(['small', 'large']),
    customer: link('customers'),
    photo: file({ kinds: ['image/png', 'image/jpeg'] }),
    sizes: list(choice(['small', 'large'])),
    photos: list(file()),
    tags: list(text(), { optional: true }),
    address: object({ city: text() }),
    extra: json({ optional: true }),
    placedBy: text({ optional: true }),
  },
  run: () => null,
})

const call = { definition: 'every', kind: 'change', input: Object(every).options.input }

/** A control of the view's own: it spreads `input` on a native one, and says what `useField` told it beside it. */
function Native(o: { name: string; as?: string }) {
  const field = useField(o.name)
  const { onChange: _onChange, ref: _ref, ...written } = field.input
  const told = { label: field.label, help: field.help ?? null, required: field.required, errorId: field.errorId }
  return createElement(
    'p',
    { 'data-field': o.name, 'data-told': JSON.stringify(told), 'data-input': JSON.stringify(written) },
    createElement(o.as ?? 'input', { ...field.input }),
  )
}

/** Draws a form over the input of `every` whose fields are the given names, and answers what each field was told. */
async function inputs(names: string[], o: { values?: Record<string, unknown>; zone?: string } = {}) {
  const view = () =>
    createElement(
      Form,
      { call, ...(o.values ? { values: o.values } : {}) },
      ...names.map((name) =>
        createElement(Native, { key: name, name, ...(name === 'note' ? { as: 'textarea' } : {}) }),
      ),
    )
  const description = described([every, screen('filled', { path: '/filled', access: 'anyone', view: () => null })])
  const made = await drawn(description, 'filled', {
    views: { filled: { name: 'filled', kind: 'screen', view } },
    page: { zone: o.zone ?? 'UTC' },
  })
  const drawing = drawingOf(made.html)
  const found: Record<string, { input: Partial<InputProps>; told: Record<string, unknown>; html: string }> = {}
  for (const one of drawing.matchAll(/<p data-field="([^"]+)" data-told="([^"]*)" data-input="([^"]*)">(.*?)<\/p>/g))
    found[one[1]] = { told: JSON.parse(unescaped(one[2])), input: JSON.parse(unescaped(one[3])), html: one[4] }
  return { found, drawing }
}

test('[32-1] input of useField writes, for each type, the attributes of its row, with the limits of the type', async () => {
  const { found } = await inputs(Object.keys(Object(every).options.input))
  const typeOf = (name: string) => found[name].input.type
  assert.deepEqual(Object.fromEntries(Object.keys(found).map((name) => [name, typeOf(name) ?? null])), {
    name: 'text',
    secret: 'password',
    note: 'text',
    count: 'number',
    share: 'number',
    agreed: 'checkbox',
    at: 'datetime-local',
    on: 'date',
    size: null,
    customer: null,
    photo: 'file',
    sizes: null,
    photos: 'file',
    tags: null,
    address: null,
    extra: null,
    placedBy: 'text',
  })
  assert.deepEqual([found.name.input.minLength, found.name.input.maxLength], [2, 40])
  assert.deepEqual([found.count.input.min, found.count.input.max, found.count.input.step], [1, 9, 1])
  assert.equal(found.share.input.step, undefined)
  assert.equal(found.photo.input.accept, 'image/png,image/jpeg')
  // A list of choices, of links or of files takes many.
  assert.deepEqual(
    ['sizes', 'photos', 'tags', 'photo'].map((name) => found[name].input.multiple ?? false),
    [true, true, false, false],
  )
  // Each field is named by its field, has an id of its own, and says whether it is required.
  for (const [name, one] of Object.entries(found)) assert.equal(one.input.name, name)
  assert.equal(new Set(Object.values(found).map((one) => one.input.id)).size, Object.keys(found).length)
  assert.deepEqual(
    ['name', 'note', 'agreed', 'share', 'placedBy'].map((name) => found[name].input.required ?? false),
    [true, false, false, false, false],
  )
  // The words a native control is spread with on the page.
  for (const written of [
    /^<input /,
    / name="name"/,
    / required=""/,
    / type="text"/,
    / minlength="2"/i,
    / maxlength="40"/i,
  ])
    assert.match(found.name.html, written)
})

test('[32-1] useField gives the label and the help words of the type, a name in words where it has no label, and an id for its words that no field has', async () => {
  const { found } = await inputs(['name', 'placedBy', 'count'])
  assert.deepEqual([found.name.told.label, found.name.told.help], ['Your name', 'As on your card'])
  assert.deepEqual([found.placedBy.told.label, found.placedBy.told.help], ['Placed by', null])
  const errorIds = Object.values(found).map((one) => String(one.told.errorId))
  assert.equal(new Set(errorIds).size, 3)
  for (const one of Object.values(found)) assert.notEqual(one.told.errorId, one.input.id)
  // Nothing has failed yet: no field says it is invalid, nor names its words.
  for (const one of Object.values(found)) {
    assert.equal(one.input['aria-invalid'], undefined)
    assert.equal(one.input['aria-describedby'], undefined)
  }
})

test('[32-1] what a field starts with is its value, a tick is checked, and a moment is written in the zone of the page', async () => {
  const { found } = await inputs(['name', 'count', 'agreed', 'at', 'on', 'size'], {
    values: { name: 'Ann', count: 3, agreed: true, at: '2026-03-08T21:45:00.000Z', on: '2026-03-08', size: 'large' },
    zone: 'Asia/Tokyo',
  })
  assert.equal(found.name.input.value, 'Ann')
  assert.equal(found.count.input.value, '3')
  assert.equal(found.agreed.input.checked, true)
  assert.equal(found.agreed.input.value, undefined)
  // Nine hours ahead of the standard time, the evening is the next morning.
  assert.equal(found.at.input.value, '2026-03-09T06:45')
  assert.equal(found.on.input.value, '2026-03-08')
  assert.equal(found.size.input.value, 'large')
})
