import { createServer } from 'node:net'
import { after, before, test } from 'node:test'

const server = createServer()

before(async () => {
  await new Promise((done) => setTimeout(done, 500))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
})

after(() => {
  server.close()
})

test('[99-1] a light test of a file whose first hook opens a server', () => {})
