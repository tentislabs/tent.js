import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../../docs/index.ts'
import { list } from '../commands/list.ts'

test('[03-5] each flag that a command of tent takes alone, with no value, stands on the page of that command', async () => {
  const missing: string[] = []
  for (const entry of list) {
    const { command } = await entry.load()
    // A command that is a folder has one page, under the name of the folder.
    const own = findPage(`command.${entry.name.split('/')[0]}`)?.text ?? ''
    // A command that takes the words of another names its flags on that one's page.
    const text = own.includes('the words of `tent start`') ? `${own}${findPage('command.start')?.text}` : own
    for (const [name, type] of Object.entries(command.args))
      if (type.kind === 'boolean' && !text.includes(`--${name}`)) missing.push(`tent ${entry.name} --${name}`)
  }
  assert.deepEqual(missing, [], `no page names ${missing.join(', ')}`)
})
