import { finding } from '../../core/internal.ts'
import type { Step } from '../work.ts'
import { found } from '../work.ts'

/** A value that is shorter is not searched for: it would be found in code that holds no secret. */
const shortest = 8

/** What one written sign after a backslash stands for in a written text of the code. */
const signs: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }

/**
 * Reads a text of code as its written texts are read: each escape is the sign it stands for. The builder writes a
 * backslash as two, a quote and a line break with a backslash, the end of a tag as `<\/`, and a letter by its
 * number. Read back so, a value stands in the text as it is.
 */
function readBack(text: string): string {
  return text.replace(
    /\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r?\n|([\s\S]))/g,
    (_, long, four, two, sign) => {
      const number = long ?? four ?? two
      if (number !== undefined) {
        const point = Number.parseInt(number, 16)
        return point <= 0x10ffff ? String.fromCodePoint(point) : ''
      }
      // A backslash at the end of a line joins two lines of a written text.
      if (sign === undefined) return ''
      return Object.hasOwn(signs, sign) ? signs[sign] : sign
    },
  )
}

/** The percent signs of a text read as the bytes they stand for, where they stand for some. */
function percentRead(text: string): string {
  return text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run)
    } catch {
      return run
    }
  })
}

/** A text with each of its line ends written the one way: a file holds a line end as its system wrote it, and code as the language reads it. */
const oneLineEnd = (text: string): string => text.replace(/\r\n?/g, '\n')

/** Every form in which a browser file may hold a text: as it is, read back from its escapes, and inside each address that holds bytes in base 64. */
function formsOf(bytes: Uint8Array): string[] {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')
  const packed = [...text.matchAll(/base64,([A-Za-z0-9+/=]{8,})/g)].map((one) =>
    Buffer.from(one[1], 'base64').toString('utf8'),
  )
  return [text, ...packed].flatMap((one) => [one, readBack(one), percentRead(one)]).map(oneLineEnd)
}

/**
 * Searches the finished browser code for every secret value that the build was handed, and fails where one is
 * found. A value is found as it is written and as a written text of the code holds it, with a quote, a backslash,
 * a line break or the end of a tag written as the builder writes them, and inside an address that holds its bytes
 * in base 64. A value of several lines is found whichever line end the value and the code have.
 */
export const step: Step = {
  order: 8,
  run: async (work) => {
    // A secrets file that this computer cannot open holds values that nothing here can look for: the build says so.
    for (const file of work.options.unsearched ?? [])
      work.findings.push(
        finding(
          'T3011',
          `The secrets file ${file} is there, and this computer cannot open it: the guard searched the browser code for none of its values.`,
          {
            fix: 'Build where the key of the secrets is at hand, as `TENT_SECRET_KEY` or as `secret.key` of the data folder, so that the guard can look for every value.',
          },
          'note',
        ),
      )
    const values = [...new Set(work.options.secrets ?? [])].filter((value) => value.length >= shortest)
    if (!values.length) return
    // Each text is searched as the build holds it, before a file is written.
    for (const [name, bytes] of work.bundle) {
      // The modules of the commands run on somebody's computer, as the browser files run in a browser.
      if (!name.startsWith('browser/') && !name.startsWith('cli/')) continue
      const forms = formsOf(bytes)
      const count = values.filter((value) => forms.some((form) => form.includes(oneLineEnd(value)))).length
      if (count)
        found(
          work,
          'T3007',
          name,
          1,
          `The browser file ${name} holds ${count === 1 ? 'a secret value' : `${count} secret values`} of this computer.`,
          'Take the value out of every file that a screen file imports, and read it on the server with `secrets`. A value that was shown to a browser is given a new one.',
        )
    }
  },
}
