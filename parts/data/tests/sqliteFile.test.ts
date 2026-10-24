import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { sqliteFile } from '../index.ts'
import { workFolder } from './work.ts'

test('[40-14a] sqliteFile makes its file, takes text, numbers, nothing and bytes, and answers rows with bytes as bytes', (t) => {
  const path = join(workFolder(t), 'kept.db')
  const file = sqliteFile(path)
  assert.ok(existsSync(path))
  file.run('CREATE TABLE kept (name TEXT PRIMARY KEY, size INTEGER, bytes BLOB, note TEXT) STRICT', [])
  file.run('INSERT INTO kept VALUES (?, ?, ?, ?)', ['a', 3, new Uint8Array([1, 2, 3]), null])
  const rows = file.all('SELECT name, size, bytes, note FROM kept WHERE name = ?', ['a'])
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.equal(Reflect.get(row, 'name'), 'a')
  assert.equal(Reflect.get(row, 'size'), 3)
  assert.equal(Reflect.get(row, 'note'), null)
  const bytes: unknown = Reflect.get(row, 'bytes')
  assert.ok(bytes instanceof Uint8Array)
  assert.deepEqual([...bytes], [1, 2, 3])
  file.close()
  file.close()
})

test('[40-14a] a write of sqliteFile is all or nothing, answers what its function answers, and the file opens again with what was written', (t) => {
  const path = join(workFolder(t), 'kept.db')
  const file = sqliteFile(path)
  file.run('CREATE TABLE kept (name TEXT PRIMARY KEY) STRICT', [])
  assert.equal(
    file.write(() => {
      file.run('INSERT INTO kept VALUES (?)', ['first'])
      return 7
    }),
    7,
  )
  assert.throws(
    () =>
      file.write(() => {
        file.run('INSERT INTO kept VALUES (?)', ['second'])
        throw new Error('the write fails after its first statement')
      }),
    /the write fails/,
  )
  // A write inside a write is part of the outer one: it is undone with it.
  assert.throws(() =>
    file.write(() => {
      file.write(() => file.run('INSERT INTO kept VALUES (?)', ['third']))
      throw new Error('the outer write fails')
    }),
  )
  file.close()
  const again = sqliteFile(path)
  const names = again.all('SELECT name FROM kept ORDER BY name', []).map((row) => Reflect.get(row, 'name'))
  again.close()
  assert.deepEqual(names, ['first'])
})
