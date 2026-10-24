// The named steps `windows` and `sign-windows`: the two small Windows programs, the per-user installer package
// made with the WiX tools, and their signatures with the certificate that the owner's settings name.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The compiler of C# that every Windows carries with its runtime of .NET. */
function compiler() {
  const root = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  return [join(root, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), join(root, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find(
    (one) => existsSync(one),
  )
}

/** The signing tool of the Windows kit for developers, the newest that lies on this computer, or the one the settings name. */
function signingTool(settings) {
  if (settings.windows?.signtool) return settings.windows.signtool
  const kits = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin')
  if (!existsSync(kits)) return undefined
  const versions = readdirSync(kits)
    .filter((one) => /^10\./.test(one))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .reverse()
  for (const one of versions) {
    const tool = join(kits, one, process.arch === 'arm64' ? 'arm64' : 'x64', 'signtool.exe')
    if (existsSync(tool)) return tool
  }
  return undefined
}

/** Runs a program to its end, and throws with what it said where it fails. */
function done(program, words, what) {
  const ran = spawnSync(program, words, { encoding: 'utf8' })
  if (ran.status !== 0) throw new Error(`${what} failed:\n${ran.stdout ?? ''}${ran.stderr ?? ''}${ran.error ?? ''}`)
  return ran.stdout
}

/**
 * Signs files with the certificate of the settings, `windows: { pfx, password, timestamp }`, by the signing tool of
 * the system. Answers whether it signed: with no certificate named the files stay unsigned, and it says so.
 */
function signWith(c, files) {
  const windows = c.settings.windows
  if (process.platform !== 'win32' || !windows?.pfx) {
    c.say(`sign-windows: ${files.length} Windows files are unsigned: ${process.platform !== 'win32' ? 'they are signed on Windows' : 'the settings name no certificate'}`)
    return false
  }
  const tool = signingTool(c.settings)
  if (!tool) throw new Error('No signing tool of the Windows kit lies on this computer: install the kit, or name signtool in the settings')
  for (const file of files)
    done(
      tool,
      [
        'sign',
        '/f',
        windows.pfx,
        ...(windows.password ? ['/p', windows.password] : []),
        '/fd',
        'SHA256',
        ...(windows.timestamp ? ['/tr', windows.timestamp, '/td', 'SHA256'] : []),
        file,
      ],
      `Signing ${file}`,
    )
  c.say(`sign-windows: ${files.length} Windows files are signed`)
  return true
}

/** The Windows files of a release that are signed: the two programs and each installer. */
const signedFiles = (c) =>
  [join(c.out, 'windows', 'tent.exe'), join(c.out, 'windows', 'tentw.exe'), ...c.systems.filter((one) => one.startsWith('win32')).map((one) => join(c.out, `tent-${c.version}-${one}.msi`))].filter((one) =>
    existsSync(one),
  )

/** The step `sign-windows`: every Windows file of the release, signed with the certificate of the settings. */
export const signWindows = (c) => signWith(c, signedFiles(c))

/** Writes the source of the installer of one system, with every file of its folders, as the WiX tools take it. */
function wixSource(c, system, laid) {
  const template = readFileSync(join(c.root, 'install', 'windows', 'tent.wxs'), 'utf8')
  const current = join(c.work, 'current')
  writeFileSync(current, `${c.version}\n`)
  return template
    .replaceAll('@CURRENT@', current)
    .replaceAll('@TRUST@', join(c.out, 'trust.json'))
    .replaceAll('@VERSION@', c.version)
    .replaceAll('@PLAYER@', join(laid, 'player'))
    .replaceAll('@RUNTIME@', join(laid, 'runtime'))
    .replaceAll('@TOOLS@', join(laid, 'tools'))
    .replaceAll('@BIN@', join(c.out, 'windows'))
    .replaceAll('@SYSTEM@', system)
}

/**
 * The step `windows`: on Windows, the two programs, built by the system's own compiler of C#, signed where the
 * settings name a certificate, and the installer of each Windows system of the release, made with the WiX tools
 * where they are on the path. Elsewhere, and without the tools, it says what it did not make.
 */
export function windows(c) {
  const systems = c.systems.filter((one) => one.startsWith('win32'))
  if (!systems.length) return
  if (process.platform !== 'win32') {
    c.say('windows: the Windows programs and installers are made on Windows: not made here')
    return
  }
  const csc = compiler()
  if (!csc) throw new Error('This Windows has no compiler of C# beside its runtime of .NET, which the two programs are built with')
  const bin = join(c.out, 'windows')
  mkdirSync(bin, { recursive: true })
  const source = join(c.root, 'install', 'windows', 'tent.cs')
  done(csc, ['/nologo', '/optimize', '/target:exe', '/define:CONSOLE', `/out:${join(bin, 'tent.exe')}`, source], 'Building tent.exe')
  done(csc, ['/nologo', '/optimize', '/target:winexe', `/out:${join(bin, 'tentw.exe')}`, source], 'Building tentw.exe')
  signWith(c, [join(bin, 'tent.exe'), join(bin, 'tentw.exe')])
  const wix = spawnSync('wix', ['--version'], { encoding: 'utf8', shell: true })
  if (wix.status !== 0) {
    c.say('windows: the WiX tools are not on the path: the Windows installer is not made')
    return
  }
  for (const system of systems) {
    const laid = join(c.work, system)
    const wxs = join(c.work, `tent-${system}.wxs`)
    writeFileSync(wxs, wixSource(c, system, laid))
    const msi = join(c.out, `tent-${c.version}-${system}.msi`)
    rmSync(msi, { force: true })
    done('wix', ['build', wxs, '-arch', system.endsWith('arm64') ? 'arm64' : 'x64', '-o', msi], `Making the installer of ${system}`)
    c.say(`windows: ${msi}`)
  }
}
