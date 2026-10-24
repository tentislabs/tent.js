import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { system } from '../rig/system.ts'
import { copyOf, planted, result, run, start } from './rigs-plant.ts'

const stored = (folder: string, engine: string) => join(folder, 'tests', 'pictures', system(), engine)

test('[03-4] a picture that differs from the stored one in more than one pixel in a hundred fails, and one within the bound passes', (t) => {
  const fresh = stored(planted('4'), 'firefox')
  rmSync(fresh, { recursive: true, force: true })
  t.after(() => rmSync(fresh, { recursive: true, force: true }))

  const withThem = run(planted('4'))
  assert.notEqual(withThem.code, 0, withThem.out)
  const held = result(planted('4'))
  assert.deepEqual(held.tests, {
    '99-1': 'passed',
    '99-2': 'passed',
    '99-3': 'passed',
    '99-4': 'passed',
    '99-5': 'failed',
    '99-6': 'failed',
    '99-7': 'failed',
    '99-8': 'failed',
  })
  assert.deepEqual(held.pictures, { 'chromium/front': 'approved', 'firefox/fresh': 'new' })
  assert.match(
    withThem.out,
    /the picture chromium\/front does not hold: 101 of its 10000 pixels differ from the stored one/,
  )
  assert.match(
    withThem.out,
    /the picture chromium\/front does not hold: it is 99 by 100, and the stored one 100 by 100/,
  )
  assert.match(
    withThem.out,
    /the picture chromium\/front does not hold: 100 of its 10000 pixels differ .* 0\.0099 of them may/,
  )

  // A picture that is not stored yet is written beside its place, and fails as not approved.
  assert.ok(
    withThem.out.includes(
      `the picture firefox/fresh is not approved: it is not stored yet, and was written as tests/pictures/${system()}/firefox/fresh.new.png`,
    ),
    withThem.out,
  )
  assert.deepEqual(
    readFileSync(join(fresh, 'fresh.new.png')),
    readFileSync(join(planted('4'), 'given', 'front.same.png')),
  )
  assert.equal(existsSync(join(fresh, 'fresh.png')), false)

  const folder = copyOf(t, '4', ['tests/differs.test.ts', 'tests/fresh.test.ts'])
  const withoutThem = run(folder)
  assert.equal(withoutThem.code, 0, withoutThem.out)
  assert.deepEqual(result(folder).pictures, { 'chromium/front': 'approved' })
})

test('[03-22] a stored picture with no approval, and one whose approval holds another fingerprint, each fail as not approved', (t) => {
  const cases = {
    'tests/bare.test.ts': 'the picture chromium/bare is not approved: it has no approval',
    'tests/other.test.ts':
      'the picture chromium/other is not approved: its approval holds another fingerprint than its own',
  }
  const both = run(planted('22'))
  assert.notEqual(both.code, 0, both.out)
  for (const words of Object.values(cases)) assert.ok(both.out.includes(words), both.out)
  assert.deepEqual(result(planted('22')).tests, { '99-1': 'passed', '99-2': 'failed', '99-3': 'failed' })
  assert.deepEqual(result(planted('22')).pictures, {
    'chromium/bare': 'new',
    'chromium/held': 'approved',
    'chromium/other': 'new',
  })

  for (const [one, words] of Object.entries(cases)) {
    const others = Object.keys(cases).filter((other) => other !== one)
    const alone = run(copyOf(t, '22', others))
    assert.notEqual(alone.code, 0, alone.out)
    assert.ok(alone.out.includes(words), alone.out)
    assert.equal(alone.out.match(/is not approved: /g)?.length, 1, alone.out)
  }

  const none = run(copyOf(t, '22', Object.keys(cases)))
  assert.equal(none.code, 0, none.out)
})

test('[03-22] a picture that is approved by the program of the rig holds from then on', (t) => {
  const folder = copyOf(t, '22')
  for (const name of ['bare', 'other']) {
    const picture = `tests/pictures/${system()}/chromium/${name}.png`
    const approved = start(folder, 'rig/pictures.ts', 'approve', picture, '--by', 'a reviewer')
    assert.equal(approved.code, 0, approved.out)
    const fingerprint = createHash('sha256')
      .update(readFileSync(join(folder, picture)))
      .digest('hex')
    assert.equal(
      readFileSync(join(stored(folder, 'chromium'), `${name}.approved`), 'utf8'),
      `sha256: ${fingerprint}\nby: a reviewer\n`,
    )
  }
  const ended = run(folder)
  assert.equal(ended.code, 0, ended.out)
  assert.deepEqual(result(folder).pictures, {
    'chromium/bare': 'approved',
    'chromium/held': 'approved',
    'chromium/other': 'approved',
  })

  const wrong = start(folder, 'rig/pictures.ts', 'approve', 'tests/pictures/none.png')
  assert.equal(wrong.code, 1, wrong.out)
})
