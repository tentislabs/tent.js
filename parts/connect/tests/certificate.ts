import { generateKeyPairSync, sign } from 'node:crypto'

/** Answers one value in the form that a certificate is written in: its tag, its length and its content. */
function der(tag: number, ...content: Uint8Array[]): Buffer {
  const body = Buffer.concat(content)
  const length =
    body.length < 128
      ? [body.length]
      : body.length < 256
        ? [0x81, body.length]
        : [0x82, body.length >> 8, body.length & 255]
  return Buffer.concat([Buffer.from([tag, ...length]), body])
}

const kind = (...bytes: number[]): Buffer => der(0x06, Buffer.from(bytes))
const moment = (at: number): Buffer =>
  der(0x17, Buffer.from(`${new Date(at).toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`))

/**
 * Makes a key and a certificate for one name, signed with that key itself and good for a day, when the test runs:
 * so no key lies in the repository. Answers both as text in the usual form. A test hands the certificate to the
 * guarded fetch as its `roots`, and the server of the test answers with it.
 */
export function certificateFor(name: string): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  // A signature of the elliptic kind over SHA-256.
  const signed = der(0x30, kind(0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02))
  const named = der(0x30, der(0x31, der(0x30, kind(0x55, 0x04, 0x03), der(0x0c, Buffer.from(name)))))
  const day = 86_400_000
  // The name that a client holds the certificate to, and that it may sign, as a root does.
  const names = der(0x30, kind(0x55, 0x1d, 0x11), der(0x04, der(0x30, der(0x82, Buffer.from(name)))))
  const root = der(
    0x30,
    kind(0x55, 0x1d, 0x13),
    der(0x01, Buffer.from([0xff])),
    der(0x04, der(0x30, der(0x01, Buffer.from([0xff])))),
  )
  const body = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    signed,
    named,
    der(0x30, moment(Date.now() - day), moment(Date.now() + day)),
    named,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, der(0x30, names, root)),
  )
  const whole = der(0x30, body, signed, der(0x03, Buffer.from([0]), sign('sha256', body, privateKey)))
  const lines = whole.toString('base64').match(/.{1,64}/g) ?? []
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    cert: `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`,
  }
}
