import assert from 'node:assert/strict'
import test from 'node:test'
import { checkSignature } from '../signature.ts'

// Examples as the providers wrote them down in their own documents: the secret, the bytes and the signature,
// signed by their code and not by ours, at the moment they name.
const examples: {
  verify: { scheme: string }
  secret: string
  body: string
  headers: Record<string, string>
  at: number
}[] = [
  {
    // GitHub, "Validating webhook deliveries": the test values it gives.
    verify: { scheme: 'github' },
    secret: "It's a Secret to Everybody",
    body: 'Hello, World!',
    headers: { 'x-hub-signature-256': 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17' },
    at: Date.now(),
  },
  {
    // Standard Webhooks: the example of the specification and of the libraries that follow it.
    verify: { scheme: 'standard' },
    secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    body: '{"test": 2432232314}',
    headers: {
      'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      'webhook-timestamp': '1614265330',
      'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    },
    at: 1614265330 * 1000,
  },
]

test('[24-7] each scheme passes the example that its provider wrote down, and fails with one byte of the body changed', () => {
  for (const one of examples) {
    const checked = (body: string) =>
      checkSignature({
        verify: one.verify,
        secret: one.secret,
        headers: new Headers(one.headers),
        body: new TextEncoder().encode(body),
        now: one.at,
        age: 300_000,
      })
    assert.doesNotThrow(() => checked(one.body), String(one.verify.scheme))
    const changed = `${one.body.slice(0, -1)}${one.body.endsWith('!') ? '?' : '!'}`
    assert.throws(() => checked(changed), { code: 'T7118' }, String(one.verify.scheme))
  }
})
