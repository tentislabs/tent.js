import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { tent } from '../shell.ts'

test('[15-8] tent docs --reference prints the file of the installed package byte for byte', async () => {
  const kept = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'reference.txt'), 'utf8')
  const lines: string[] = []
  assert.equal(await tent(['docs', '--reference'], { out: (line) => lines.push(line) }), 0)
  assert.equal(`${lines.join('\n')}\n`, kept)
})
