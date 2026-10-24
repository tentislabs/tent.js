import assert from 'node:assert/strict'
import test from 'node:test'
import type { GuardedFetch } from '../../connect/index.ts'
import { newCertKey } from '../certs/signed.ts'
import { speak } from '../certs/speak.ts'

// An authority is spoken to where its address names it: a redirect to another host is never followed. The guarded
// fetch is stood in for here, since this computer has no second host that a secure connection reaches.

test('[41-12.37] the address of an authority that sends on to another host is not followed there', async () => {
  const followed: string[] = []
  // As the guarded fetch does: where a redirect may be followed, it is, and the answer is the other host's.
  const fetch: GuardedFetch = async (address, init) => {
    if (init?.redirects !== 0 && init?.redirect !== 'error' && init?.redirect !== 'manual') {
      followed.push(String(address))
      return Response.json({
        newNonce: 'https://other.example/nonce',
        newAccount: 'https://other.example/account',
        newOrder: 'https://other.example/order',
      })
    }
    throw new TypeError(`${String(address)} answered a redirect, and none is followed.`)
  }
  await assert.rejects(speak({ fetch, from: 'https://acme.example.com/directory', keys: newCertKey() }), /redirect/)
  assert.deepEqual(followed, [])
})
