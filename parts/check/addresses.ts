// How the rules of one address read the address of a definition: the addresses its path fits, and its methods.

/** Takes a path. Answers it as the addresses it fits: the name of a value of the address does not tell two paths apart. */
export const fitted = (path: string): string =>
  path
    .split('/')
    .map((part) => (part.startsWith(':') ? ':' : part))
    .join('/')

/** Takes what a route states as its `method`. Answers its methods, in capitals. */
export const methodsOf = (stated: unknown): string[] =>
  (Array.isArray(stated) ? stated : [stated]).filter((one) => typeof one === 'string').map((one) => one.toUpperCase())
