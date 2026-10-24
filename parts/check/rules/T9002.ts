import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, inside, writtenIn } from '../rule.ts'

/** An asset that is named by a written text and is no file under `assets/`. */
export const rule: Rule = {
  code: 'T9002',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    // The definitions that may name an asset: the project, a screen and a component.
    const records: Record<string, unknown> = {
      ...description.screens,
      ...description.components,
      [description.app.name]: description.project,
    }
    for (const one of writtenIn(source)) {
      const missing = new Set<string>()
      inside(records[one.name], (record) => {
        if (typeof record.asset === 'string' && !Object.hasOwn(description.assets, record.asset))
          missing.add(record.asset)
      })
      for (const name of missing)
        found.push(
          at(
            'T9002',
            one,
            undefined,
            `the asset \`${name}\` is named, and no file \`assets/${name}\` is there.`,
            'Put the file into `assets/`, or name an asset that is there.',
          ),
        )
    }
    return found
  },
}
