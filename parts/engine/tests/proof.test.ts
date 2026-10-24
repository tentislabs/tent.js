import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { tokenProof } from '../proof.ts'
import type { Answered, Running } from './apps.ts'
import { running, send } from './apps.ts'

const tokenOf = (dataFolder: string): string =>
  String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)

/** Asks an engine to prove that it holds its token, as a command of this computer does, with no token sent. */
const proved = (run: Running, body: unknown, o: { from?: string; method?: string } = {}): Promise<Answered> =>
  send(run.app, `${run.origin}/_t/admin`, { body: JSON.stringify(body), ...o })

const drawn = (): string => randomBytes(32).toString('hex')

test('[15-6@4] an engine proves that it holds its token to whoever asks from this computer: the answer is the fingerprint of the token with the number that was sent, and tells nothing of the token', async (t) => {
  const run = await running(t)
  const token = tokenOf(run.dataFolder)
  const number = drawn()
  const answered = await proved(run, { number })
  assert.equal(answered.status, 200)
  const proof = String(Object(answered.body.value).proof)
  // The fingerprint is keyed with the token: whoever holds the token works the same one out, and nobody else.
  assert.equal(proof, createHmac('sha256', token).update(number).digest('hex'))
  assert.equal(proof, tokenProof(token, number))
  assert.notEqual(proof, tokenProof(`${token}x`, number))
  assert.deepEqual(Object.keys(Object(answered.body.value)), ['proof'])
  assert.equal(JSON.stringify(answered.body).includes(token), false)
  // No token is asked, and one that is sent changes nothing.
  const withToken = await send(run.app, `${run.origin}/_t/admin`, {
    body: JSON.stringify({ number }),
    headers: { authorization: 'Bearer wrong' },
  })
  assert.equal(Object(withToken.body.value).proof, proof)
})

test('[15-6@4] what an engine answered for one number helps nobody with another: each number has an answer of its own, a number is 64 characters of base sixteen and nothing shorter, and nothing but a number is answered', async (t) => {
  const run = await running(t)
  const token = tokenOf(run.dataFolder)
  // A listener in the middle may ask the engine as often as it likes: it learns the answer for the numbers it
  // sent, and a command draws its own.
  const numbers = Array.from({ length: 50 }, drawn)
  const proofs: string[] = []
  for (const number of numbers) proofs.push(String(Object((await proved(run, { number })).body.value).proof))
  assert.equal(new Set(proofs).size, numbers.length)
  // Asked twice for one number it answers the same: the answer is of the number, and holds nothing of the asking.
  assert.equal(Object((await proved(run, { number: numbers[0] })).body.value).proof, proofs[0])
  // Two numbers that differ in one character have answers that say nothing of each other.
  const near = `${numbers[0].slice(0, 63)}${numbers[0].endsWith('0') ? '1' : '0'}`
  const other = String(Object((await proved(run, { number: near })).body.value).proof)
  let same = 0
  for (let i = 0; i < 64; i++) if (other[i] === proofs[0][i]) same++
  assert.ok(same < 32, `${same} of 64 characters are the same`)
  // A number that a listener could run through, or that is none, is not answered.
  const refused: unknown[] = [
    { number: 'ab' },
    { number: numbers[0].slice(0, 63) },
    { number: `${numbers[0]}0` },
    { number: numbers[0].toUpperCase().replace(/[0-9]/g, 'A') },
    { number: `${numbers[0].slice(0, 63)}g` },
    { number: 7 },
    { number: '' },
    {},
    { number: numbers[0], args: {} },
    [numbers[0]],
    'x',
  ]
  for (const body of refused) {
    const answered = await proved(run, body)
    assert.deepEqual([answered.status, answered.error.code], [400, 'T0002'], JSON.stringify(body))
    assert.equal(JSON.stringify(answered.body).includes(token), false)
  }
  // It is asked from this computer alone, and by a POST alone.
  const far = await proved(run, { number: numbers[0] }, { from: '203.0.113.9' })
  assert.deepEqual([far.status, far.error.code], [401, 'T0006'])
  const got = await send(run.app, `${run.origin}/_t/admin`, { method: 'GET' })
  assert.equal(got.status, 404)
})
