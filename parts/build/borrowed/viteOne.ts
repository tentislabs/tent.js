import { posix } from 'node:path'

/**
 * Takes the text of a module to start at, a function that answers the text of a file of the bundle by its path, and
 * whether the code is made small. Has the builder make one plain script of it, with every file of the bundle that
 * it imports, however deep, packed in: the script imports nothing and gives nothing, so it can stand inside a page.
 * An import is named from the file that makes it. Throws what the builder throws, and for a file that is not there.
 */
export async function bundleOne(o: {
  entry: string
  read(path: string): string | undefined
  small: boolean
}): Promise<string> {
  const { build } = await import('vite')
  const mark = '\0tent-one:'
  const entry = `${mark}entry`
  const built = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
    mode: o.small ? 'production' : 'development',
    plugins: [
      {
        name: 'tent:one',
        enforce: 'pre',
        resolveId(source, importer) {
          if (source === entry) return entry
          const from =
            importer?.startsWith(mark) && importer !== entry ? posix.dirname(importer.slice(mark.length)) : ''
          const path = posix.normalize(posix.join(from, source)).replace(/^\.\//, '')
          return `${mark}${path}`
        },
        load(id) {
          if (id === entry) return o.entry
          const path = id.slice(mark.length)
          const text = o.read(path)
          if (text === undefined) throw new Error(`the bundle holds no file ${path}`)
          return text
        },
      },
    ],
    build: {
      write: false,
      minify: o.small,
      modulePreload: false,
      rolldownOptions: {
        input: { one: entry },
        experimental: { attachDebugInfo: 'none' },
        output: { format: 'iife', entryFileNames: '[name].js', codeSplitting: false },
      },
    },
  })
  for (const one of Array.isArray(built) ? built : [built])
    if ('output' in one) for (const file of one.output) if (file.type === 'chunk' && file.isEntry) return file.code
  throw new Error('the builder made no script of the screen')
}
