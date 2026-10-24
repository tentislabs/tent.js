import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import { isStored } from '../../core/internal.ts'

/**
 * A screen whose `seo.image` names a component and that is not open to anyone, or one of whose own `data` entries
 * is not: its picture is drawn as nobody and handed to whoever a link reaches, so it would show what only some may
 * see, or nothing at all. An error.
 */
export const rule: Rule = {
  code: 'T6032',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((written) => written.word === 'screen')
      .flatMap((written) => {
        const screen = Object.hasOwn(description.screens, written.name) ? description.screens[written.name] : undefined
        const image = isStored(screen?.seo) ? screen.seo.image : undefined
        if (!isStored(image) || typeof image.view !== 'string') return []
        const entries = Object.values(isStored(screen?.data) ? screen.data : {}).flatMap((entry) => {
          const named = isStored(entry) ? (entry.query ?? entry.action) : undefined
          return typeof named === 'string' ? [named] : []
        })
        const closed = entries.find((name) => {
          const fn = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
          return !isStored(fn?.access) || fn.access.rule !== 'anyone'
        })
        if (isStored(screen?.access) && screen.access.rule === 'anyone' && closed === undefined) return []
        const why =
          closed === undefined ? 'the screen is not open to anyone' : `its entry of \`${closed}\` is not open to anyone`
        return [
          at(
            'T6032',
            written,
            statedAt(written, ['seo']),
            `the screen's \`seo.image\` names a component and ${why}: its picture is drawn as nobody and shown to whoever a shared link reaches.`,
            'Name a picture in `seo.image` in place of a component, or open the screen and what it reads to anyone where everything it shows may be seen by anyone.',
          ),
        ]
      }),
}
