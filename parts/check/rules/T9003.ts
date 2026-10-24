import type { Finding } from '../../core/index.ts'
import { finding, isStored } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { inside, writtenIn } from '../rule.ts'
import { messagesWrittenIn } from '../worded.ts'

/**
 * A message whose key no language has: a `message(...)` written in a file, as the `label` and the `help` of a type
 * too, and each value of a `choice` that states `messages`, whose message is under `<messages>.<value>`.
 */
export const rule: Rule = {
  code: 'T9003',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const messages: Record<string, unknown> = isStored(description.messages) ? description.messages : {}
    const keys = new Set(Object.values(messages).flatMap((held) => (isStored(held) ? Object.keys(held) : [])))
    // The framework's own messages are there in every app.
    const known = (key: string): boolean => keys.has(key) || key.startsWith('tent.')
    const found: Finding[] = []
    for (const one of messagesWrittenIn(source))
      if (!known(one.key))
        found.push(
          finding('T9003', `The message ${one.key} is in no language file of the project.`, {
            fix: `Give ${one.key} in the language file of each language, or name a key that one gives.`,
            where: { file: one.path, line: one.line },
          }),
        )
    // A choice that states its messages, on a column of a table or on a field of the input of a function.
    const written = writtenIn(source)
    const typesOf: [string, unknown][] = [
      ...Object.entries(description.tables).map(([name, table]): [string, unknown] => [name, Object(table).columns]),
      ...Object.entries(description.functions).map(([name, made]): [string, unknown] => [name, Object(made).input]),
    ]
    for (const [name, types] of typesOf)
      inside(types, (type) => {
        if (type.kind !== 'choice' || typeof type.messages !== 'string' || !Array.isArray(type.values)) return
        for (const value of type.values) {
          const key = `${type.messages}.${String(value)}`
          if (known(key)) continue
          const at = written.find((one) => one.name === name)
          found.push(
            finding(
              'T9003',
              `${name}: the value ${String(value)} of a choice that states \`messages: '${type.messages}'\` has no message under ${key}.`,
              {
                fix: `Give ${key} in the language files, or leave \`messages\` out of the choice.`,
                ...(at ? { where: { file: at.path, line: at.line, definition: name } } : {}),
              },
            ),
          )
        }
      })
    return found
  },
}
