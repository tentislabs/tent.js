import { json, python, text } from 'tentjs'
import { notes } from './tables.ts'

export const plain = python('plain', { file: 'py/plain.py', input: {}, output: text(), access: 'signedIn' })

export const fails = python('fails', { file: 'py/fails.py', input: {}, output: text(), access: 'signedIn' })

export const counted = python('counted', {
  file: 'py/counted.py',
  input: {},
  rows: { notes: notes.where({}) },
  output: json(),
  access: 'signedIn',
})

export const named = python('named', { file: 'json.py', input: {}, output: text(), access: 'signedIn' })
