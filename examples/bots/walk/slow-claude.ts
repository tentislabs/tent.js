// The walk's Claude Code: the stand-in of fakes/claude.ts, with a pause after each part of an answer, so a page
// shows the answer as it arrives, as the person's own Claude Code writes it.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const PAUSE = 350

const child = spawn(
  process.execPath,
  [join(import.meta.dirname, '..', 'fakes', 'claude.ts'), ...process.argv.slice(2)],
  {
    stdio: ['pipe', 'pipe', 'inherit'],
  },
)
const closed: Promise<number> = new Promise((done) => child.on('close', (ended) => done(ended ?? 0)))
process.stdin.pipe(child.stdin)
const lines = createInterface({ input: child.stdout })
for await (const line of lines) {
  process.stdout.write(`${line}\n`)
  if (line.includes('"content_block_delta"')) await new Promise((done) => setTimeout(done, PAUSE))
}
process.exitCode = await closed
