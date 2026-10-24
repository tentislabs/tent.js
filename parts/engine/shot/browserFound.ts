import { join } from 'node:path'

import { browserProgram } from './enginesFound.ts'

/** The places where a browser of the Chromium family is installed on each system, the first found first. */
function placesOf(): string[] {
  const env = (name: string): string => process.env[name] ?? ''
  if (process.platform === 'win32')
    return [
      join(env('PROGRAMFILES'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(env('PROGRAMFILES(X86)'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(env('LOCALAPPDATA'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(env('PROGRAMFILES(X86)'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(env('PROGRAMFILES'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(env('PROGRAMFILES'), 'Chromium', 'Application', 'chrome.exe'),
    ]
  if (process.platform === 'darwin')
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ]
}

/** Where the program lies in a folder of a browser that a tool of tests installed: the newer layout first. */
function insidesOf(): string[][] {
  const mac = process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  const linux = process.arch === 'arm64' ? 'linux-arm64' : 'linux64'
  if (process.platform === 'win32')
    return [
      ['chrome-win64', 'chrome.exe'],
      ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
      ['chrome-win', 'chrome.exe'],
    ]
  if (process.platform === 'darwin')
    return [
      [`chrome-${mac}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
      [`chrome-headless-shell-${mac}`, 'chrome-headless-shell'],
      ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ]
  return [
    [`chrome-${linux}`, 'chrome'],
    [`chrome-headless-shell-${linux}`, 'chrome-headless-shell'],
    ['chrome-linux', 'chrome'],
  ]
}

/** Where the program lies in a folder of the hidden browser, the build of Chrome for tests with no window. */
function hiddenInsides(): string[][] {
  const system =
    process.platform === 'win32'
      ? 'win64'
      : process.platform === 'darwin'
        ? `mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
        : process.arch === 'arm64'
          ? 'linux-arm64'
          : 'linux64'
  return [[`chrome-headless-shell-${system}`, `chrome-headless-shell${process.platform === 'win32' ? '.exe' : ''}`]]
}

/**
 * Answers the program of a browser of the Chromium family to drive. For a test, the hidden one of the pinned build
 * alone. Else the one that `TENT_BROWSER` names, else one that is installed on the computer, else the hidden one,
 * fetched on first use. Throws T0016, naming the part, where none is found and the hidden one cannot be fetched.
 */
export const browserFound = (o: { test?: boolean } = {}): Promise<string> =>
  browserProgram(o, {
    part: 'browser',
    insides: hiddenInsides(),
    tests: { folder: 'chromium_headless_shell', named: /^chromium(_headless_shell)?-\d+$/, insides: insidesOf() },
    variable: 'TENT_BROWSER',
    places: placesOf(),
    known: 'hidden browser',
    none: {
      message: 'No browser of the Chromium family was found on the computer, and the hidden one could not be fetched.',
      fix: 'Install Chrome or Chromium, or name the program of one in TENT_BROWSER.',
    },
  })
