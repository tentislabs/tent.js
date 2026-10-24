// The place where the project of a workspace is built: a program of its own, started with none of the product's
// secrets in its environment. A host puts a container or a machine of its own around it; this is the smallest one.
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import type { Sandbox } from 'tentjs/engine'

// The words of a command as a shell would split them, with quotes kept together.
function wordsOf(command: string): string[] {
  const words: string[] = []
  for (const found of command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) words.push(found[1] ?? found[2] ?? found[3] ?? '')
  return words
}

export function processBox(o: { tent: readonly string[] }): Sandbox {
  return {
    async start({ id, folder, work }) {
      await mkdir(work, { recursive: true })
      return { id, folder, work }
    },
    run(box, command, options) {
      const [first, ...rest] = wordsOf(command)
      const words = first === 'tent' ? [...o.tent, ...rest] : [first ?? '', ...rest]
      const [program, ...args] = words
      return new Promise((done, failed) => {
        const child = spawn(program ?? '', args, {
          cwd: box.folder,
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          },
          signal: options?.signal,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let out = ''
        let err = ''
        child.stdout.setEncoding('utf8').on('data', (piece: string) => {
          out = (out + piece).slice(-1_000_000)
        })
        child.stderr.setEncoding('utf8').on('data', (piece: string) => {
          err = (err + piece).slice(-1_000_000)
        })
        child.once('error', failed)
        child.once('close', (code) => done({ code: code ?? 1, out, err }))
      })
    },
    async stop() {},
  }
}
