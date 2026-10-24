import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { createServer as createSecure } from 'node:https'
import type { TestContext } from 'node:test'
import { TentError } from '../../core/index.ts'
import type { Lookup } from '../lookup.ts'

/** What a stand-in server was asked: the method, the path, the headers and the body of each request, in their order. */
export interface Asked {
  method: string
  path: string
  headers: Record<string, string>
  body: string
}

/** A server on this computer that a test started: its port, its address, and what it was asked so far. */
export interface StandIn {
  port: number
  origin: string
  asked: Asked[]
}

/**
 * Starts a server on this computer, on a free port that the system gives, which answers each request with what
 * the test says. With a key and a certificate it answers over a secure connection. It is closed, with every
 * connection it holds, when the test ends, also where the test fails.
 */
export async function standIn(
  t: TestContext,
  answer: (request: IncomingMessage, response: ServerResponse, asked: Asked) => void,
  secure?: { key: string; cert: string },
): Promise<StandIn> {
  const asked: Asked[] = []
  const heard = (request: IncomingMessage, response: ServerResponse): void => {
    const pieces: Buffer[] = []
    request.on('data', (piece: Buffer) => pieces.push(piece))
    request.on('end', () => {
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(request.headers)) headers[name] = String(value)
      const one = {
        method: request.method ?? '',
        path: request.url ?? '',
        headers,
        body: Buffer.concat(pieces).toString('utf8'),
      }
      asked.push(one)
      answer(request, response, one)
    })
  }
  const server = secure ? createSecure(secure, heard) : createServer(heard)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  })
  const at = server.address()
  assert.ok(at !== null && typeof at === 'object')
  return { port: at.port, origin: `${secure ? 'https' : 'http'}://127.0.0.1:${at.port}`, asked }
}

/** A resolver of a test: the names it was asked, in their order, and the look-up that a guarded fetch is handed. */
export interface Names {
  asked: string[]
  lookup: Lookup
}

/**
 * Makes a resolver that answers each name with the next of its answers, and with its last one from then on. A name
 * that it does not hold fails, so that no test asks the resolver of the system for a name.
 */
export function names(answers: Record<string, string[][]>): Names {
  const asked: string[] = []
  return {
    asked,
    lookup: (name) => {
      const times = asked.filter((one) => one === name).length
      asked.push(name)
      const held = answers[name]
      if (!held) return Promise.reject(new Error(`the resolver of the test holds no name ${name}`))
      return Promise.resolve(held[Math.min(times, held.length - 1)] ?? [])
    },
  }
}

/** Answers the error that a promise is refused with, and fails where it is kept. */
export async function failure(work: Promise<unknown>): Promise<Error> {
  try {
    await work
  } catch (error) {
    assert.ok(error instanceof Error, `what was thrown is no error: ${String(error)}`)
    return error
  }
  throw new assert.AssertionError({ message: 'the promise was kept, and it should have been refused' })
}

/**
 * Holds that a promise is refused with T0022 by one rule, and that the message names the rule's address. Answers
 * the error.
 */
export async function refused(work: Promise<unknown>, rule: string, address?: string): Promise<TentError> {
  const error = await failure(work)
  assert.ok(error instanceof TentError, `${error.name}: ${error.message}`)
  assert.equal(`${error.code} ${error.fields?.rule}`, `T0022 ${rule}`, error.message)
  if (address !== undefined) {
    assert.ok(error.message.includes(address), `${error.message} does not name ${address}`)
    assert.equal(error.fields?.address, address)
  }
  return error
}
