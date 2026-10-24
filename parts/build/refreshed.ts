// The end of a module of development for Fast Refresh. The page code of development holds React's own runtime as
// `__tentRefresh` of the page, and a module reaches it by the two names that the builder's transform writes,
// `$RefreshReg$` and `$RefreshSig$`, which Vite's plug-in for React hands each module the same way.
import type { SourceFile } from './work.ts'

// What React's own transform reads in a comment of a file: its components are mounted anew at every save.
const resets = /\/\/[^\n]*@refresh reset|\/\*(?:(?!\*\/)[\s\S])*@refresh reset/

/**
 * Takes a file of the project and the address of its module in the bundle. Answers the text that the module ends
 * with in a development build for a browser: the two names of the transform, which register each component under the
 * place of the file and its name, as React's runtime asks for a family; the view of each screen and component, under
 * the place of the file and the name of its definition, since a definition is a record and no component; and the
 * address and the address it ran from, by which a page knows that it holds the module, and at which mark it ran it. Every name does nothing on a page that holds no runtime.
 */
export function refreshEnd(file: SourceFile, address: string): string {
  const reset = resets.test(file.text)
  const place = JSON.stringify(`${file.path} `)
  const views = (file.seen?.declared ?? []).filter((one) => one.word === 'screen' || one.word === 'component')
  return [
    `function $RefreshReg$(type, id) { globalThis.__tentRefresh?.register(type, ${place} + id, ${reset}) }`,
    `function $RefreshSig$() { return globalThis.__tentRefresh?.sign(${reset}) ?? ((type) => type) }`,
    // A family that stands inside another is named after it, as React's runtime names the render of a `forwardRef`.
    ...views.map(
      (one) => `$RefreshReg$(${one.exportName}.options?.view, ${JSON.stringify(`${one.name ?? one.exportName}$view`)})`,
    ),
    `globalThis.__tentRefresh?.held(${JSON.stringify(address)}, import.meta.url)`,
    '',
  ].join('\n')
}
