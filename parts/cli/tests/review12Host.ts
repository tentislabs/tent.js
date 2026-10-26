import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { recordedCopy } from './recordedProject.ts'
import { shell } from './typed.ts'

/** A server of this computer that stands for another host, and the paths that were asked of it. */
export async function anotherHost(t: TestContext): Promise<{ at: string; asked: string[] }> {
  const asked: string[] = []
  const server = createServer((request, answer) => {
    asked.push(String(request.url))
    answer.writeHead(200, { 'content-type': 'image/svg+xml' })
    answer.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  const address: AddressInfo | string | null = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { at: `http://127.0.0.1:${String(port)}`, asked }
}

/** The project `recorded` with the folder `review12/outside` over it, and the other host named where the app may reach it. */
export function outsideCopy(t: TestContext, name: string, at: string): string {
  const project = recordedCopy(t, name, 'review12/outside')
  writeFileSync(
    join(project, 'lib', 'at.ts'),
    `export const pictureAt = '${at}/picture'\nexport const httpAt = '${at}/http'\n`,
  )
  writeFileSync(
    join(project, 'tent.ts'),
    `import { project } from 'tentjs'\n\nexport const recorded = project('recorded', { title: 'Recorded', hosts: ['${at}'], privateHosts: ['${at}'] })\n`,
  )
  return project
}

/** `tent test` in a program of its own, as `tested` starts it, while this program goes on answering requests. */
export function testedNow(project: string, ...words: string[]): Promise<{ ended: number; printed: string }> {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const temp = join(project, '..', 'temp')
  const child = spawn(process.execPath, [shell, 'test', ...words], {
    cwd: project,
    env: { ...env, TEMP: temp, TMP: temp, TMPDIR: temp },
  })
  let printed = ''
  child.stdout.on('data', (part) => {
    printed += String(part)
  })
  child.stderr.on('data', (part) => {
    printed += String(part)
  })
  return new Promise((done) => child.on('close', (code) => done({ ended: code ?? -1, printed })))
}
