// The one file that names the test font: the font that every stored picture of the tests is drawn with, so that a
// picture does not hang on the fonts of a computer. It is borrowed for the tests alone, and shipped in nothing.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** The family that every text of a picture is drawn with: regular, medium and bold, each with its italic. */
export const testFamily = 'Tent Test'

/** A second face of the test font, for a text that asks for a family of its own: its light cut. */
export const secondFamily = 'Tent Test Second'

// Each face of the two families: the file of the font, its weight, and whether it is the italic.
const faces: [family: string, file: string, weight: number, italic: boolean][] = [
  [testFamily, 'Roboto-Regular', 400, false],
  [testFamily, 'Roboto-RegularItalic', 400, true],
  [testFamily, 'Roboto-Medium', 500, false],
  [testFamily, 'Roboto-MediumItalic', 500, true],
  [testFamily, 'Roboto-Bold', 700, false],
  [testFamily, 'Roboto-BoldItalic', 700, true],
  [secondFamily, 'Roboto-Light', 400, false],
]

/** The folder of the files of the test font, as the borrowed package holds them. */
const fontFolder = (): string =>
  join(dirname(createRequire(import.meta.url).resolve('roboto-fontface/package.json')), 'fonts', 'roboto')

/** Where the file of the regular face of the test font lies: a test that needs the bytes of a real font reads it. */
export const testFontFile = (): string => join(fontFolder(), 'Roboto-Regular.woff2')

let rules: string | undefined

/**
 * Answers the style rules that give a page the test font: one face for each weight and cut of the two families,
 * each with the bytes of its file inside the rule, so that a page that reaches no network has them.
 */
export function testFontRules(): string {
  if (rules !== undefined) return rules
  const folder = fontFolder()
  rules = faces
    .map(([family, file, weight, italic]) => {
      const bytes = readFileSync(join(folder, `${file}.woff2`)).toString('base64')
      const style = italic ? 'italic' : 'normal'
      return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${bytes}) format('woff2')}`
    })
    .join('\n')
  return rules
}
