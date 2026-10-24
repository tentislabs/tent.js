// A planted step of an upgrade, for the test of `tent upgrade`: it renames the option `oldTitle` of `project`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const upgrade = {
  from: '0.9',
  to: '1.0',
  steps: [
    {
      name: 'oldTitle is title',
      async run(o: { folder: string }): Promise<void> {
        const file = join(o.folder, 'tent.ts')
        writeFileSync(file, readFileSync(file, 'utf8').replace('oldTitle:', 'title:'))
      },
    },
  ],
}
