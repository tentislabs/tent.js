import { posix, win32 } from 'node:path'

/** What a definition of a system is made of: the app's name, its user, the folder of the install, and the words. */
export interface Defined {
  name: string
  user: string
  home: string
  // The words the launcher is handed, `start` first.
  words: string[]
  // Started with the machine, rather than at the sign-in of the user.
  machine: boolean
}

/**
 * Takes the name of an app, which the description of its bundle gives and nobody typed. Answers the name that a
 * definition and its file are named by: each sign but a letter, a digit, `_` and `-` becomes `-`, so it names no
 * other folder.
 */
export const definitionName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, '-')

/** The name of an app as a line of text holds it: no line of its own begins inside it. */
const oneLine = (name: string): string => name.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')

/** A word as a systemd unit holds it: quoted, with a backslash and a quote escaped, and `%` and `$` doubled. */
const unitWord = (word: string): string =>
  `"${word.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$$$')}"`

/** Text as XML holds it, with each of its marks written as its name. */
const xmlText = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/**
 * A word on a command line of Windows, as a program reads it back: quoted where it is empty or holds a space, a tab
 * or a quote, with each quote and the backslashes before it and before the end escaped.
 */
function windowsWord(word: string): string {
  if (word !== '' && !/[\s"]/.test(word)) return word
  let out = '"'
  let slashes = 0
  for (const sign of word) {
    if (sign === '\\') slashes++
    else if (sign === '"') {
      out += `${'\\'.repeat(slashes * 2 + 1)}"`
      slashes = 0
    } else {
      out += `${'\\'.repeat(slashes)}${sign}`
      slashes = 0
    }
  }
  return `${out}${'\\'.repeat(slashes * 2)}"`
}

/** A systemd unit that starts the app at the start of the machine, as its user, with the right to the low ports alone. */
function unitOf(o: Defined): string {
  const launcher = posix.join(o.home, 'bin', 'tent')
  return [
    '[Unit]',
    // A `%` of the unit's own text starts a specifier of systemd, which a doubled one does not.
    `Description=${oneLine(o.name).replaceAll('%', '%%')} (Tent.js)`,
    'After=network-online.target',
    '',
    '[Service]',
    `User=${o.user}`,
    `ExecStart=${[launcher, ...o.words].map(unitWord).join(' ')}`,
    'Restart=always',
    'RestartSec=2',
    'AmbientCapabilities=CAP_NET_BIND_SERVICE',
    'CapabilityBoundingSet=CAP_NET_BIND_SERVICE',
    'NoNewPrivileges=true',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n')
}

/** A launchd file: of the person, which starts at their sign-in, or of the machine, as that user. */
function launchdOf(o: Defined): string {
  const launcher = posix.join(o.home, 'bin', 'tent')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>com.tentjs.${definitionName(o.name)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...[launcher, ...o.words].map((word) => `    <string>${xmlText(word)}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    ...(o.machine ? ['  <key>UserName</key>', `  <string>${xmlText(o.user)}</string>`] : []),
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

/**
 * A task of the task scheduler of Windows: at the sign-in of the user, or at the start of the machine as that user
 * with no password kept, started again a minute after a failure. The launcher with no window of its own runs it.
 */
function taskOf(o: Defined): string {
  const trigger = o.machine
    ? ['    <BootTrigger>', '      <Enabled>true</Enabled>', '    </BootTrigger>']
    : [
        '    <LogonTrigger>',
        '      <Enabled>true</Enabled>',
        `      <UserId>${xmlText(o.user)}</UserId>`,
        '    </LogonTrigger>',
      ]
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo>',
    `    <Description>${xmlText(`${oneLine(o.name)} (Tent.js)`)}</Description>`,
    '  </RegistrationInfo>',
    '  <Triggers>',
    ...trigger,
    '  </Triggers>',
    '  <Principals>',
    '    <Principal id="Author">',
    `      <UserId>${xmlText(o.user)}</UserId>`,
    `      <LogonType>${o.machine ? 'S4U' : 'InteractiveToken'}</LogonType>`,
    '      <RunLevel>LeastPrivilege</RunLevel>',
    '    </Principal>',
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <RestartOnFailure>',
    '      <Interval>PT1M</Interval>',
    '      <Count>999</Count>',
    '    </RestartOnFailure>',
    '    <Enabled>true</Enabled>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    `      <Command>${xmlText(win32.join(o.home, 'bin', 'tentw.exe'))}</Command>`,
    `      <Arguments>${xmlText(o.words.map(windowsWord).join(' '))}</Arguments>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    '',
  ].join('\n')
}

/** The definition that starts the app on a system, in that system's own form. */
export function definitionOf(system: 'linux' | 'darwin' | 'win32', o: Defined): string {
  return system === 'win32' ? taskOf(o) : system === 'darwin' ? launchdOf(o) : unitOf(o)
}

/** The one line that starts the app, for a builder's own wrapper, as the shell of the system takes it. */
export function lineOf(system: 'linux' | 'darwin' | 'win32', o: Defined): string {
  if (system === 'win32') return [win32.join(o.home, 'bin', 'tent.exe'), ...o.words].map(windowsWord).join(' ')
  const quoted = (word: string): string => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)
  return [posix.join(o.home, 'bin', 'tent'), ...o.words].map(quoted).join(' ')
}
