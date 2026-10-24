// A site of another host beside an app of a test: it answers a framed page that tells the page around it what it
// could reach, and a picture, and counts what it is asked for.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

/** A site of another host: its address, and the paths it was asked for, in the order they came. */
export interface Site {
  address: string
  asked: string[]
}

// A picture, which the site answers for any address that ends in `.png`.
const point = readFileSync(join(import.meta.dirname, 'media', 'assets', 'poster.png'))

// The page that a frame shows: it tries to reach the page around it and to read its address, keeps a value in
// its own storage, and tells the page around what it found.
const framed = `<!doctype html><meta charset="utf-8"><title>Framed</title><body>Framed<script>
let reached = false
try { reached = Boolean(window.parent.document.body) } catch { reached = false }
let address = ''
try { address = window.parent.location.href } catch { address = '' }
let kept = false
try { localStorage.setItem('kept', 'yes'); kept = localStorage.getItem('kept') === 'yes' } catch { kept = false }
window.parent.postMessage({ framed: location.search.slice(1), reached, address, referrer: document.referrer, kept }, '*')
</script>`

/** Starts a site of another host on a port the system gives. */
export async function site(): Promise<Site> {
  const asked: string[] = []
  const server = createServer((request, answer) => {
    asked.push(request.url ?? '')
    if ((request.url ?? '').split('?')[0].endsWith('.png')) {
      answer.writeHead(200, { 'content-type': 'image/png' })
      answer.end(point)
      return
    }
    answer.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    answer.end(framed)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  // The site stands for as long as the tests of its file run, and keeps none of them waiting at their end.
  server.unref()
  const where = server.address()
  const port = typeof where === 'object' && where !== null ? where.port : 0
  return { address: `http://127.0.0.1:${port}`, asked }
}
