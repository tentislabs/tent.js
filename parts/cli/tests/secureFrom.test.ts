import assert from 'node:assert/strict'
import test from 'node:test'
import { secureFrom } from '../serving/secureFrom.ts'

// The authority that `--secure from=` names is spoken to over a secure connection alone.

test('[41-12.37] tent start refuses --secure from= an address over plain http, and takes one over https', () => {
  const stated = (from: string) => ({ domain: 'shop.example.com', secure: [`from=${from}`] })
  assert.throws(() => secureFrom(stated('http://127.0.0.1:8080/directory'), process.cwd()), /https/)
  assert.throws(() => secureFrom(stated('not an address'), process.cwd()), /https/)
  assert.equal(
    secureFrom(stated('https://acme.example.com/directory'), process.cwd())?.secure.from,
    'https://acme.example.com/directory',
  )
})
