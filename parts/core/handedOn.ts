/**
 * Takes one of the names by which a module finds the page code, what the page code holds under that name, and
 * where the file lies that gives `names`. Answers the text of a small module that hands on, as that name's own
 * exports, what the page code holds under it: so the page code is loaded once, whichever name a module asks by.
 */
export function handedOn(name: string, all: object, from: string): string {
  const keys = Object.keys(all).filter((key) => key !== 'default' && /^[A-Za-z_$][\w$]*$/.test(key))
  return [
    `import { names } from ${JSON.stringify(from)}`,
    `const all = names[${JSON.stringify(name)}]`,
    'export default all.default ?? all',
    ...keys.sort().map((key) => `export const ${key} = all.${key}`),
    '',
  ].join('\n')
}
