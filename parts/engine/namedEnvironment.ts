// What a program the engine starts of its own may read of the environment: the search path, the person's folder,
// the temporary folder, the proxy with the certificates a proxy is trusted by, and the language. Nothing else of the
// engine's reaches it. A file of its own, so an app with no Python loads nothing of the Python program for it.
const named = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  // Windows finds its own programs and settings under this name, which holds nothing of the engine's.
  'SystemRoot',
]

/** The named list of the environment as this program holds it: on Windows a name in any capitals, once. */
export function namedEnvironment(names: readonly string[] = named): Record<string, string> {
  const env: Record<string, string> = {}
  const wanted = new Set(names.map((one) => (process.platform === 'win32' ? one.toUpperCase() : one)))
  for (const [name, value] of Object.entries(process.env)) {
    const key = process.platform === 'win32' ? name.toUpperCase() : name
    if (value !== undefined && wanted.has(key) && !Object.keys(env).some((one) => one.toUpperCase() === key))
      env[name] = value
  }
  return env
}
