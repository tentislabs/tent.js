import type { KeyObject } from 'node:crypto'
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  X509Certificate,
} from 'node:crypto'
import { request as plainRequest } from 'node:http'
import type { Server } from 'node:https'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import type { TestContext } from 'node:test'
import { connect } from 'node:tls'

// A stand-in of a certificate authority that speaks the standard by which one gives certificates (RFC 8555), on an
// address of this computer, with a root of its own that is made for the test and kept nowhere. It is written apart
// from the engine's own part, so that a fault of that part is not shared by what checks it.

/** One piece of the byte form of a certificate: its kind, its length, and its body. */
function piece(kind: number, ...bodies: Uint8Array[]): Buffer {
  const body = Buffer.concat(bodies)
  const length =
    body.length < 0x80
      ? Buffer.from([body.length])
      : (() => {
          const bytes: number[] = []
          for (let left = body.length; left > 0; left = Math.floor(left / 256)) bytes.unshift(left % 256)
          return Buffer.from([0x80 | bytes.length, ...bytes])
        })()
  return Buffer.concat([Buffer.from([kind]), length, body])
}
const list = (...bodies: Uint8Array[]): Buffer => piece(0x30, ...bodies)
const set = (...bodies: Uint8Array[]): Buffer => piece(0x31, ...bodies)
const octets = (body: Uint8Array): Buffer => piece(0x04, body)
const yes = (): Buffer => piece(0x01, Buffer.from([0xff]))
const utf8 = (words: string): Buffer => piece(0x0c, Buffer.from(words, 'utf8'))
/** A whole number from its bytes, in its shortest form: no zero in front but where the high bit would be set. */
function whole(body: Uint8Array): Buffer {
  let bytes = Buffer.from(body)
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] ?? 0) < 0x80) bytes = bytes.subarray(1)
  return piece(0x02, (bytes[0] ?? 0) >= 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes)
}
const bits = (body: Uint8Array, unused = 0): Buffer => piece(0x03, Buffer.from([unused]), body)
const place = (n: number, made: boolean, ...bodies: Uint8Array[]): Buffer => piece((made ? 0xa0 : 0x80) | n, ...bodies)
function id(dotted: string): Buffer {
  const [first, second, ...rest] = dotted.split('.').map(Number)
  const body = [first * 40 + second]
  for (const n of rest) {
    const group = [n % 128]
    for (let left = Math.floor(n / 128); left > 0; left = Math.floor(left / 128)) group.unshift(0x80 | (left % 128))
    body.push(...group)
  }
  return piece(0x06, Buffer.from(body))
}
function time(date: Date): Buffer {
  const iso = date.toISOString()
  const short = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
  return piece(0x17, Buffer.from(short, 'latin1'))
}

/** The pieces inside the body of one piece, each as its kind and its whole bytes. */
function inside(bytes: Buffer): { kind: number; whole: Buffer; body: Buffer }[] {
  const found: { kind: number; whole: Buffer; body: Buffer }[] = []
  for (let at = 0; at < bytes.length; ) {
    const kind = bytes[at]
    let length = bytes[at + 1]
    let head = 2
    if (length & 0x80) {
      const count = length & 0x7f
      length = 0
      for (let k = 0; k < count; k++) length = length * 256 + bytes[at + 2 + k]
      head = 2 + count
    }
    found.push({
      kind,
      whole: bytes.subarray(at, at + head + length),
      body: bytes.subarray(at + head, at + head + length),
    })
    at += head + length
  }
  return found
}

const pem = (der: Buffer): string =>
  `-----BEGIN CERTIFICATE-----\n${der
    .toString('base64')
    .replace(/(.{64})/g, '$1\n')
    .trimEnd()}\n-----END CERTIFICATE-----\n`

const ecdsa = (): Buffer => list(id('1.2.840.10045.4.3.2'))
const named = (called: string): Buffer => list(set(list(id('2.5.4.3'), utf8(called))))

/** The other names of a certificate: names of the web and addresses. */
const otherNames = (names: string[], addresses: string[]): Buffer =>
  list(
    id('2.5.29.17'),
    octets(
      list(
        ...names.map((one) => place(2, false, Buffer.from(one, 'latin1'))),
        ...addresses.map((one) => place(7, false, Buffer.from(one.split('.').map(Number)))),
      ),
    ),
  )

/** A certificate, signed by `by`: its subject's public key in the byte form, its names, and its days. */
function certificate(o: {
  publicKey: Buffer
  issuer: Buffer
  subject: Buffer
  by: KeyObject
  from: Date
  to: Date
  names?: string[]
  addresses?: string[]
  authority?: boolean
}): Buffer {
  const serial = randomBytes(16)
  serial[0] &= 0x7f
  const extensions = [otherNames(o.names ?? [], o.addresses ?? [])]
  if (o.authority) {
    extensions.push(list(id('2.5.29.19'), yes(), octets(list(yes()))))
    // Signs certificates, and its own connections.
    extensions.push(list(id('2.5.29.15'), yes(), octets(bits(Buffer.from([0x86]), 1))))
  }
  const held = list(
    place(0, true, whole(Buffer.from([2]))),
    whole(serial),
    ecdsa(),
    o.issuer,
    list(time(o.from), time(o.to)),
    o.subject,
    o.publicKey,
    place(3, true, list(...extensions)),
  )
  return list(held, ecdsa(), bits(sign('sha256', held, o.by)))
}

/** What the stand-in saw: each try of a name, each proof it looked at, and each certificate it gave. */
interface Seen {
  orders: string[]
  proofs: { name: string; kind: 'http-01' | 'tls-alpn-01'; held: boolean }[]
  given: string[]
  accounts: number
}

/** The stand-in, as a test holds it. */
export interface Authority {
  from: string
  // The root of the authority, as text in the usual form: its own address is served under it too.
  root: string
  seen: Seen
  // What the next certificates are: their life, and how long before now they start. In seconds.
  life: number
  backdate: number
  // The names it refuses an order for, and whether it refuses every one.
  refused: Set<string>
  refuseAll: boolean
  // Where it looks for the proofs of a name: the plain port and the secure port of the engine.
  plainPort: number
  securePort: number
}

const read64 = (value: string): string => Buffer.from(value, 'base64url').toString('utf8')

/** The fingerprint of an account's key, as the answer to each question carries it. */
const thumbprint = (jwk: { crv: string; kty: string; x: string; y: string }): string =>
  createHash('sha256')
    .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
    .digest('base64url')

/** Asks the plain port of this computer for the answer to a question, as the name it is for. */
function plainAnswer(port: number, name: string, token: string): Promise<string | undefined> {
  return new Promise((done) => {
    const asked = plainRequest(
      { host: '127.0.0.1', port, path: `/.well-known/acme-challenge/${token}`, headers: { host: name } },
      (answer) => {
        const parts: Buffer[] = []
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () => done(answer.statusCode === 200 ? Buffer.concat(parts).toString('utf8') : undefined))
      },
    )
    asked.on('error', () => done(undefined))
    asked.setTimeout(5000, () => asked.destroy())
    asked.end()
  })
}

/** Opens a secure connection for the proof of a name, and answers whether its certificate carries the answer. */
function provenInside(port: number, name: string, answer: string): Promise<boolean> {
  const wanted = octets(octets(createHash('sha256').update(answer).digest()))
  return new Promise((done) => {
    const socket = connect({
      host: '127.0.0.1',
      port,
      servername: name,
      ALPNProtocols: ['acme-tls/1'],
      rejectUnauthorized: false,
    })
    socket.setTimeout(5000, () => socket.destroy())
    socket.once('secureConnect', () => {
      const cert = socket.getPeerX509Certificate()
      const held =
        socket.alpnProtocol === 'acme-tls/1' &&
        cert !== undefined &&
        cert.raw.includes(id('1.3.6.1.5.5.7.1.31')) &&
        cert.raw.includes(wanted) &&
        (cert.subjectAltName ?? '').split(', ').includes(`DNS:${name}`)
      socket.destroy()
      done(held)
    })
    socket.once('error', () => done(false))
    socket.once('close', () => done(false))
  })
}

interface Order {
  names: string[]
  status: string
  authorizations: string[]
  certificate?: string
  error?: object
}

interface Question {
  name: string
  status: string
  token: string
  account: string
  error?: object
}

/** Starts the stand-in on a free port of this computer, ended with the test. */
export async function startAuthority(t: TestContext, o: { plainPort: number; securePort: number }): Promise<Authority> {
  const rootKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const rootName = named('the test authority of Tent.js')
  const now = Date.now()
  const rootDer = certificate({
    publicKey: rootKey.publicKey.export({ type: 'spki', format: 'der' }),
    issuer: rootName,
    subject: rootName,
    by: rootKey.privateKey,
    from: new Date(now - 3_600_000),
    to: new Date(now + 7 * 86_400_000),
    addresses: ['127.0.0.1'],
    authority: true,
  })
  const root = pem(rootDer)
  const seen: Seen = { orders: [], proofs: [], given: [], accounts: 0 }
  const accounts = new Map<string, { jwk: { crv: string; kty: string; x: string; y: string } }>()
  const orders = new Map<string, Order>()
  const questions = new Map<string, Question>()
  const certs = new Map<string, string>()
  const nonces = new Set<string>()
  let address = ''
  const stand: Authority = {
    from: '',
    root,
    seen,
    life: 90 * 86_400,
    backdate: 0,
    refused: new Set(),
    refuseAll: false,
    plainPort: o.plainPort,
    securePort: o.securePort,
  }
  const nonce = (): string => {
    const one = randomBytes(12).toString('base64url')
    nonces.add(one)
    return one
  }
  const problem = (type: string, detail: string, status = 400): { status: number; body: object } => ({
    status,
    body: { type: `urn:ietf:params:acme:error:${type}`, detail },
  })
  const orderShown = (key: string, order: Order): object => ({
    status: order.status,
    identifiers: order.names.map((value) => ({ type: 'dns', value })),
    authorizations: order.authorizations,
    finalize: `${address}/finalize/${key}`,
    ...(order.certificate ? { certificate: order.certificate } : {}),
    ...(order.error ? { error: order.error } : {}),
  })
  /** Looks at the proof of one question, and marks it and every order that waits on it. */
  const look = async (key: string, kind: 'http-01' | 'tls-alpn-01'): Promise<void> => {
    const question = questions.get(key)
    if (!question) return
    const account = accounts.get(question.account)
    if (!account) return
    const answer = `${question.token}.${thumbprint(account.jwk)}`
    const held =
      kind === 'http-01'
        ? (await plainAnswer(stand.plainPort, question.name, question.token)) === answer
        : await provenInside(stand.securePort, question.name, answer)
    seen.proofs.push({ name: question.name, kind, held })
    question.status = held ? 'valid' : 'invalid'
    if (!held)
      question.error = {
        type: 'urn:ietf:params:acme:error:unauthorized',
        detail: `the proof of ${question.name} did not hold`,
      }
    for (const order of orders.values())
      if (order.status === 'pending' && order.authorizations.some((one) => one.endsWith(`/authz/${key}`))) {
        const all = order.authorizations.map((one) => questions.get(one.split('/').pop() ?? ''))
        if (all.some((one) => one?.status === 'invalid')) {
          order.status = 'invalid'
          order.error = question.error
        } else if (all.every((one) => one?.status === 'valid')) order.status = 'ready'
      }
  }
  /** Answers one signed request, or the refusal of it. */
  const answered = (path: string, body: string): { status: number; body: object | string; location?: string } => {
    const sent = JSON.parse(body) as { protected: string; payload: string; signature: string }
    const head = JSON.parse(read64(sent.protected)) as {
      alg: string
      nonce: string
      url: string
      jwk?: { crv: string; kty: string; x: string; y: string }
      kid?: string
    }
    if (!nonces.delete(head.nonce)) return problem('badNonce', 'that nonce is not one of ours')
    if (head.url !== `${address}${path}`) return problem('unauthorized', 'the address in the head is not this one')
    const accountKey = head.kid ? head.kid.split('/').pop() : undefined
    const jwk = head.jwk ?? (accountKey ? accounts.get(accountKey)?.jwk : undefined)
    if (!jwk) return problem('accountDoesNotExist', 'no such account', 400)
    const key = createPublicKey({ key: { ...jwk }, format: 'jwk' })
    const signed = verify(
      'sha256',
      Buffer.from(`${sent.protected}.${sent.payload}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sent.signature, 'base64url'),
    )
    if (!signed) return problem('malformed', 'the signature does not hold')
    const payload: Record<string, unknown> = sent.payload === '' ? {} : JSON.parse(read64(sent.payload))
    const [, kind, which, how] = path.split('/')
    if (kind === 'account') {
      if (head.jwk === undefined) return problem('malformed', 'a new account is asked for with its key')
      if (payload.termsOfServiceAgreed !== true)
        return problem('userActionRequired', 'the terms were not agreed to', 403)
      const made = String(accounts.size + 1)
      accounts.set(made, { jwk: head.jwk })
      seen.accounts++
      return { status: 201, body: { status: 'valid' }, location: `${address}/acct/${made}` }
    }
    if (!accountKey) return problem('malformed', 'this request is signed by its account')
    if (kind === 'order' && which === undefined) {
      const names = (Array.isArray(payload.identifiers) ? payload.identifiers : []).map((one) =>
        String(Reflect.get(Object(one), 'value')),
      )
      for (const one of names) seen.orders.push(one)
      if (stand.refuseAll || names.some((one) => stand.refused.has(one)))
        return problem('rejectedIdentifier', `no certificate is given for ${names.join(', ')}`)
      const made = String(orders.size + 1)
      const authorizations = names.map((name) => {
        const asked = String(questions.size + 1)
        questions.set(asked, {
          name,
          status: 'pending',
          token: randomBytes(16).toString('base64url'),
          account: accountKey,
        })
        return `${address}/authz/${asked}`
      })
      const order: Order = { names, status: 'pending', authorizations }
      orders.set(made, order)
      return { status: 201, body: orderShown(made, order), location: `${address}/order/${made}` }
    }
    if (kind === 'order' && which !== undefined) {
      const order = orders.get(which)
      return order ? { status: 200, body: orderShown(which, order) } : problem('malformed', 'no such order', 404)
    }
    if (kind === 'authz' && which !== undefined) {
      const question = questions.get(which)
      if (!question) return problem('malformed', 'no such question', 404)
      return {
        status: 200,
        body: {
          status: question.status,
          identifier: { type: 'dns', value: question.name },
          challenges: ['http-01', 'tls-alpn-01'].map((type) => ({
            type,
            url: `${address}/chall/${which}/${type}`,
            token: question.token,
            status: question.status,
            ...(question.error ? { error: question.error } : {}),
          })),
        },
      }
    }
    if (kind === 'chall' && which !== undefined && (how === 'http-01' || how === 'tls-alpn-01')) {
      const question = questions.get(which)
      if (!question) return problem('malformed', 'no such question', 404)
      if (question.status === 'pending') {
        question.status = 'processing'
        void look(which, how)
      }
      return { status: 200, body: { type: how, status: question.status, token: question.token } }
    }
    if (kind === 'finalize' && which !== undefined) {
      const order = orders.get(which)
      if (order?.status !== 'ready') return problem('orderNotReady', 'the order is not ready', 403)
      const request = Buffer.from(String(payload.csr), 'base64url')
      const [info] = inside(inside(request)[0].body)
      const [, , publicKey] = inside(info.body)
      for (const one of order.names)
        if (!request.includes(Buffer.from(one, 'latin1'))) return problem('badCSR', `the request does not name ${one}`)
      const from = new Date(Date.now() - stand.backdate * 1000 - 60_000)
      const der = certificate({
        publicKey: publicKey.whole,
        issuer: rootName,
        subject: list(),
        by: rootKey.privateKey,
        from,
        to: new Date(from.getTime() + stand.life * 1000),
        names: order.names,
      })
      certs.set(which, pem(der) + root)
      order.status = 'valid'
      order.certificate = `${address}/cert/${which}`
      seen.given.push(new X509Certificate(der).fingerprint256)
      return { status: 200, body: orderShown(which, order) }
    }
    if (kind === 'cert' && which !== undefined) {
      const chain = certs.get(which)
      return chain ? { status: 200, body: chain } : problem('malformed', 'no such certificate', 404)
    }
    return problem('malformed', `no address ${path}`, 404)
  }
  const server: Server = createServer(
    { key: String(rootKey.privateKey.export({ type: 'pkcs8', format: 'pem' })), cert: root },
    (request, response) => {
      const path = request.url ?? '/'
      const parts: Buffer[] = []
      request.on('data', (part: Buffer) => parts.push(part))
      request.on('end', () => {
        response.setHeader('replay-nonce', nonce())
        response.setHeader('cache-control', 'no-store')
        if (path === '/dir') {
          response.setHeader('content-type', 'application/json')
          response.end(
            JSON.stringify({
              newNonce: `${address}/nonce`,
              newAccount: `${address}/account`,
              newOrder: `${address}/order`,
              meta: { termsOfService: `${address}/terms` },
            }),
          )
          return
        }
        if (path === '/nonce') {
          response.statusCode = request.method === 'HEAD' ? 200 : 204
          response.end()
          return
        }
        let done: { status: number; body: object | string; location?: string }
        try {
          done = answered(path, Buffer.concat(parts).toString('utf8'))
        } catch (error) {
          done = problem('malformed', String(error))
        }
        response.statusCode = done.status
        if (done.location) response.setHeader('location', done.location)
        if (typeof done.body === 'string') {
          response.setHeader('content-type', 'application/pem-certificate-chain')
          response.end(done.body)
        } else {
          response.setHeader('content-type', done.status >= 400 ? 'application/problem+json' : 'application/json')
          response.end(JSON.stringify(done.body))
        }
      })
    },
  )
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  address = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
  stand.from = `${address}/dir`
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  )
  return stand
}
