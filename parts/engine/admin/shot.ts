import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'

/** Reads a size written as `<width>x<height>`, or nothing for a text that is none. */
function sizeOf(written: unknown): { width: number; height: number } | undefined {
  const found = typeof written === 'string' ? /^(\d{2,5})x(\d{2,5})$/.exec(written) : null
  return found ? { width: Number(found[1]), height: Number(found[2]) } : undefined
}

/**
 * `tent shot <address>`: a picture of a screen of the app that runs, as nobody, written into `shots/` where `out`
 * names no file.
 */
export const admin: Admin = {
  name: 'shot',
  async run(o, args) {
    const address = wordOf(args, 'address', 'the path of a screen')
    const read = (name: string): unknown => Reflect.get(args, name)
    const size = sizeOf(read('size'))
    const out = read('out')
    const wait = Number(read('wait'))
    const { shotOf } = await import('../shot/shot.ts')
    return shotOf(o, address, {
      ...(size ? { size } : {}),
      ...(read('full') === true ? { full: true } : {}),
      ...(read('dark') === true ? { dark: true } : {}),
      ...(typeof out === 'string' ? { out } : {}),
      ...(Number.isFinite(wait) && wait > 0 ? { wait } : {}),
    })
  },
}
