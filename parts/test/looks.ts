import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { TentError } from '../core/index.ts'
import { noteTouched } from '../engine/index.ts'
import type { Page } from './page.ts'
import { engineOf } from './page.ts'
import { differing, readPng } from './png.ts'

/** What a test holds a page to: the picture kept of it, and what a reader of the screen heard of it. */
export interface Held {
  /**
   * Holds a picture of the page against the one kept in `tests/looks/<engine>/<name>.png` of the project, within
   * `share` of its pixels, one in a hundred where it is left out. Fails as not approved where none is kept, and
   * where it differs, and writes the new one beside, as `<name>.new.png`, which `tent test --looks update` keeps.
   */
  looks(name: string, o?: { share?: number }): Promise<void>
  /**
   * Holds what a reader of the screen hears of the page against what is kept in `tests/heard/<engine>/<name>.txt`
   * of the project. Fails as `looks` does, and writes the new one beside as `<name>.new.txt`.
   */
  heard(name: string): Promise<void>
}

// The folder of the project of each page of a test, which holds what is kept of it.
const projects = new WeakMap<Page, string>()

/** Takes a page of a test and the folder of its project, which `expect` reads what is kept from. */
export const keptIn = (page: Page, folder: string): void => void projects.set(page, folder)

/** A name of a picture or of what was heard: letters, digits, hyphens and dots, and no way out of its folder. */
function nameHeld(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || name.includes('..'))
    throw new TentError('T0002', `${JSON.stringify(name)} cannot name what is kept of a page.`, {
      fix: 'Name it with letters, digits, hyphens and dots, as `orders` or `orders-dark`.',
    })
  return name
}

/** The failure of a page that does not look or sound as it was kept, with the new one written beside. */
function unkept(what: string, kept: string, fresh: string, why: string): TentError {
  return new TentError(
    'T0002',
    `${what} ${why}: the new one is written beside it, ${fresh}, and is not approved yet.`,
    {
      fix: `Look at ${fresh}, and keep it with \`tent test --looks update\` where it is right. It is held against ${kept}.`,
    },
  )
}

/** Writes a file, with the folders it lies in. */
function written(file: string, bytes: Uint8Array | string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
}

/**
 * Takes a page that `app.open` answered. Answers what holds it to what is kept of it in the project of its test
 * app: `looks` for a picture, and `heard` for what a reader of the screen hears.
 */
export function expect(page: Page): Held {
  const folder = projects.get(page)
  if (folder === undefined)
    throw new TentError('T0013', '`expect` holds a page that `app.open` of a test app answered.')
  return {
    async looks(name, o = {}) {
      const kept = join(folder, 'tests', 'looks', engineOf(page), `${nameHeld(name)}.png`)
      const fresh = kept.replace(/\.png$/, '.new.png')
      // Under `tent test`, the kept picture the test compared: a test of it runs again once the picture changed.
      noteTouched('pictures', relative(folder, kept).split(sep).join('/'))
      const taken = await page.picture()
      if (!existsSync(kept)) {
        written(fresh, taken)
        throw unkept(`No picture ${name} is kept`, kept, fresh, 'yet')
      }
      const share = o.share ?? 0.01
      const off = differing(readPng(readFileSync(kept)), readPng(taken)).share
      if (off <= share) return
      written(fresh, taken)
      throw unkept(
        `The page does not look as the picture ${name}`,
        kept,
        fresh,
        `: ${(off * 100).toFixed(2)} in a hundred of its pixels differ, where ${(share * 100).toFixed(2)} may`,
      )
    },
    async heard(name) {
      const kept = join(folder, 'tests', 'heard', engineOf(page), `${nameHeld(name)}.txt`)
      const fresh = kept.replace(/\.txt$/, '.new.txt')
      // The kept text is what the result stands on, as a kept picture is.
      noteTouched('heard', relative(folder, kept).split(sep).join('/'))
      const said = await page.reader()
      if (!existsSync(kept)) {
        written(fresh, said)
        throw unkept(`Nothing heard as ${name} is kept`, kept, fresh, 'yet')
      }
      if (readFileSync(kept, 'utf8').replaceAll('\r\n', '\n') === said) return
      written(fresh, said)
      throw unkept(`A reader of the screen does not hear the page as ${name}`, kept, fresh, 'is kept')
    },
  }
}
