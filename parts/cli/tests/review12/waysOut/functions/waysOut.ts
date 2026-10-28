import { promises as dns } from 'node:dns'
import { connect } from 'node:net'
import { Worker } from 'node:worker_threads'
import { action, text } from 'tentjs'
import { spawned } from 'review12-spawn'
import { dnsAt, httpAt, pipeAt } from '../lib/at'

// Each a way of the code's own out of the program that is neither a plain fetch nor a socket that names a port.

export const askName = action('askName', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => {
    const resolver = new dns.Resolver({ timeout: 500, tries: 1 })
    resolver.setServers([dnsAt])
    return resolver.resolve4('review12.example').then(
      () => 'answered',
      () => 'refused',
    )
  },
})

export const askPipe = action('askPipe', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () =>
    new Promise<string>((done) => {
      const socket = connect(pipeAt, () => {
        socket.end('from the app')
        done('connected')
      })
      socket.on('error', () => done('refused'))
    }),
})

export const askByPackage = action('askByPackage', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => spawned(`fetch('${httpAt}/spawned').then(() => {}, () => {})`),
})

export const askByThread = action('askByThread', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () =>
    new Promise<string>((done) => {
      const worker = new Worker(
        `fetch('${httpAt}/thread').then(() => require('node:worker_threads').parentPort.postMessage('asked'), () => require('node:worker_threads').parentPort.postMessage('refused'))`,
        { eval: true },
      )
      worker.once('message', (said) => {
        void worker.terminate()
        done(String(said))
      })
      worker.once('error', () => done('failed'))
    }),
})
