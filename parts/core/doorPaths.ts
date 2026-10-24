/**
 * Takes the path of an address. Answers the number of the file of the sitemap that it names, 0 for
 * `/sitemap.xml` and the number of `/sitemap-<number>.xml`, and nothing for any other path.
 */
export function sitemapFile(path: string): number | undefined {
  if (path === '/sitemap.xml') return 0
  const found = /^\/sitemap-([1-9][0-9]{0,5})\.xml$/.exec(path)
  return found ? Number(found[1]) : undefined
}

/**
 * Takes the path of an address. Answers whether the door takes it before any language, redirect or screen, for
 * every app alike: the engine's own addresses under `/_t/`, the API, MCP, sign-in for programs, the sitemap and
 * `/robots.txt`. A `route` is the app's own, and is held beside this by whoever knows the routes.
 */
export function isDoorPath(path: string): boolean {
  return (
    path === '/_t' ||
    path.startsWith('/_t/') ||
    path.startsWith('/api/') ||
    path === '/mcp' ||
    path.startsWith('/.well-known/oauth-') ||
    path === '/robots.txt' ||
    sitemapFile(path) !== undefined
  )
}
