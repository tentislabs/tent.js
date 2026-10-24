import type { Finding } from '../../core/index.ts'
import { finding, isStored } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { languageFilesIn } from '../worded.ts'

/** Whether a key is the framework's own, which no language must give. */
const isOwn = (key: string): boolean => key.startsWith('tent.')

/** A key that one language has and another lacks: a warning, and the page shows the message of the default language. */
export const rule: Rule = {
  code: 'T9001',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const messages: Record<string, unknown> = isStored(description.messages) ? description.messages : {}
    const languages = Array.isArray(description.project.languages) ? description.project.languages.map(String) : []
    const keys = new Set(Object.values(messages).flatMap((held) => (isStored(held) ? Object.keys(held) : [])))
    const files = languageFilesIn(source)
    const found: Finding[] = []
    for (const language of languages) {
      const held = isStored(messages[language]) ? messages[language] : {}
      const file = files.find((one) => one.language === language)
      for (const key of [...keys].sort()) {
        if (isOwn(key) || Object.hasOwn(held, key)) continue
        found.push(
          finding(
            'T9001',
            `The language \`${language}\` has no message for the key ${key}, which another language has: the page shows the message of the default language in its place.`,
            {
              fix: `Give ${key} in the language file of \`${language}\`.`,
              ...(file ? { where: { file: file.path, line: file.line } } : {}),
            },
            'warning',
          ),
        )
      }
    }
    return found
  },
}
