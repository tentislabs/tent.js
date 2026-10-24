import assert from 'node:assert/strict'
import { test } from 'node:test'
import { action, boolean, list, number, project, python, query, table, text, where } from '../index.ts'
import type { Loaded } from '../internal.ts'
import { definitionSource, describe, fileSource } from '../internal.ts'

/** The description of a project of one file, with the definitions that are handed. */
function described(more: Loaded[]): ReturnType<typeof describe>['description'] {
  const made = describe({ definitions: [{ value: project('shop', {}), file: 'tent.ts', from: 0, to: 1 }, ...more] })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  return made.description
}

const users = table('users', {
  columns: { email: text(), roles: list(text()) },
  access: { read: 'owner' },
})

test('[34-2] definitionSource writes a length of time and a size in words, in the largest unit that says them exactly, and leaves out what equals its default', () => {
  const description = described([
    { value: users },
    {
      value: query('recent', {
        access: 'signedIn',
        rows: users.where({ email: { startsWith: 'a' } }),
        live: true,
        refresh: '90 seconds',
        heavy: false,
      }),
    },
  ])
  assert.equal(
    definitionSource(description, 'recent'),
    [
      "export const recent = query('recent', {",
      "  access: 'signedIn',",
      "  rows: users.where({ email: { startsWith: 'a' } }),",
      "  refresh: '90 seconds',",
      '})',
    ].join('\n'),
  )
  assert.equal(definitionSource(described([]), 'shop'), "export const shop = project('shop', {})")
  const limits = describe({
    definitions: [
      {
        value: project('shop', {
          limits: {
            callSize: '2 MB',
            uploadSize: 1536,
            queryTime: '2 seconds',
            sessionTime: '1.5 hours',
            liveRows: 500,
            runsKept: '14 days',
            logSize: '1 GB',
          },
        }),
      },
    ],
  }).description
  assert.match(
    definitionSource(limits, 'shop'),
    /callSize: '2 MB',\n {4}uploadSize: 1536,\n {4}queryTime: '2 seconds',\n {4}sessionTime: '90 minutes',\n {4}liveRows: 500,\n {4}runsKept: '2 weeks',\n {4}logSize: '1 GB',/,
  )
})

test('[34-2] code has no text of this kind: definitionSource throws T0013 for a code function, a python, a table one of whose rules is code, a project that states identify, a screen and a component, and T0001 for a name that is not there', () => {
  const description = describe({
    definitions: [
      { value: project('shop', { identify: () => 'u1' }) },
      { value: users },
      { value: table('notes', { columns: { body: text() }, access: { read: where(() => ({ body: 'x' })) } }) },
      { value: action('send', { access: 'signedIn', run: async () => {} }) },
      {
        value: python('churn', { file: 'ml/churn.py', input: { n: number() }, output: boolean(), access: 'signedIn' }),
      },
      // A screen and a component as their words make them: their view is code.
      {
        value: { definition: 'homeScreen', kind: 'screen', options: { path: '/', access: 'anyone', view: () => null } },
      },
      { value: { definition: 'Card', kind: 'component', options: { view: () => null } } },
    ],
  }).description
  const code = (name: string): unknown => {
    try {
      definitionSource(description, name)
    } catch (error) {
      return error instanceof Error ? Reflect.get(error, 'code') : undefined
    }
    return undefined
  }
  for (const name of ['shop', 'notes', 'send', 'churn', 'homeScreen', 'Card']) assert.equal(code(name), 'T0013', name)
  assert.equal(code('users'), undefined)
  assert.equal(code('nothingOfThatName'), 'T0001')
})

test('[34-2] fileSource writes each top-level name that its definitions read above them, from the value that is stored, and throws where two of them hold different values under one name', () => {
  const body = (value: unknown): object[] => [{ return: { read: { named: { top: 'LABELS' }, value }, path: ['open'] } }]
  const one = { object: [['open', 'Open']] }
  const made = (values: unknown[]): ReturnType<typeof describe>['description'] =>
    describe({
      definitions: [
        { value: project('shop', {}), file: 'tent.ts', from: 0, to: 1 },
        ...values.map((value, k) => ({
          value: query(`q${k}`, { access: 'signedIn', run: () => 'x' }),
          file: 'functions/labels.ts',
          from: k,
          to: k + 1,
          bodies: { run: body(value) },
        })),
      ],
    }).description
  assert.equal(
    fileSource(made([one, one]), ['q0', 'q1'], { path: 'functions/labels.ts' }),
    [
      "import { query } from 'tentjs'",
      '',
      "const LABELS = { open: 'Open' }",
      '',
      "export const q0 = query('q0', {",
      "  access: 'signedIn',",
      '  run: () => LABELS.open,',
      '})',
      '',
      "export const q1 = query('q1', {",
      "  access: 'signedIn',",
      '  run: () => LABELS.open,',
      '})',
      '',
    ].join('\n'),
  )
  assert.throws(
    () => fileSource(made([one, { object: [['open', 'Other']] }]), ['q0', 'q1'], { path: 'functions/labels.ts' }),
    /LABELS/,
  )
})
