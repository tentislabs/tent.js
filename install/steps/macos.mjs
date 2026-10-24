// The named steps `macos` and `sign-apple`: the package of macOS that installs into the person's own folder with no
// administrator, made with the system's own tools on a Mac, and its signing and notarising with the owner's
// Apple account, which the settings name.
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function done(program, words, what) {
  const ran = spawnSync(program, words, { encoding: 'utf8' })
  if (ran.status !== 0) throw new Error(`${what} failed:\n${ran.stdout ?? ''}${ran.stderr ?? ''}`)
}

/**
 * The step `macos`. For each macOS system of the release, on a Mac: the folders of the version are laid where the
 * package puts them, under the person's own folder, and its script after the install moves them into place.
 */
export function macos(c) {
  const systems = c.systems.filter((one) => one.startsWith('darwin'))
  if (!systems.length) return
  if (process.platform !== 'darwin') {
    c.say('macos: the macOS package is made on a Mac: not made here')
    return
  }
  for (const system of systems) {
    const stage = join(c.work, `${system}-pkg`)
    rmSync(stage, { recursive: true, force: true })
    const root = join(stage, 'root', '.tent-package', c.version)
    mkdirSync(root, { recursive: true })
    for (const one of ['runtime', 'player', 'tools']) cpSync(join(c.work, system, one), join(root, one), { recursive: true })
    const scripts = join(stage, 'scripts')
    mkdirSync(scripts, { recursive: true })
    const after = readFileSync(join(c.root, 'install', 'macos', 'postinstall'), 'utf8').replaceAll('@VERSION@', c.version)
    writeFileSync(join(scripts, 'postinstall'), after)
    chmodSync(join(scripts, 'postinstall'), 0o755)
    const part = join(stage, 'tent.pkg')
    done('pkgbuild', ['--root', join(stage, 'root'), '--identifier', 'com.tentjs.player', '--version', c.version, '--install-location', '/', '--scripts', scripts, part], 'pkgbuild')
    const distribution = join(stage, 'distribution.xml')
    writeFileSync(
      distribution,
      `<?xml version="1.0" encoding="utf-8"?>\n<installer-gui-script minSpecVersion="2">\n  <title>Tent.js ${c.version}</title>\n  <domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/>\n  <options customize="never" require-scripts="false" hostArchitectures="${system.endsWith('arm64') ? 'arm64' : 'x86_64'}"/>\n  <choices-outline><line choice="tent"/></choices-outline>\n  <choice id="tent" title="Tent.js"><pkg-ref id="com.tentjs.player"/></choice>\n  <pkg-ref id="com.tentjs.player" version="${c.version}">tent.pkg</pkg-ref>\n</installer-gui-script>\n`,
    )
    const pkg = join(c.out, `tent-${c.version}-${system}.pkg`)
    done('productbuild', ['--distribution', distribution, '--package-path', stage, pkg], 'productbuild')
    c.say(`macos: ${pkg}`)
  }
}

/**
 * The step `sign-apple`: each macOS package signed with the identity of the settings, `apple: { installer, profile }`,
 * and notarised with the stored profile of the owner's account. With none named the packages stay unsigned, and it
 * says so.
 */
export function signApple(c) {
  const pkgs = c.systems.filter((one) => one.startsWith('darwin')).map((one) => join(c.out, `tent-${c.version}-${one}.pkg`)).filter((one) => existsSync(one))
  if (process.platform !== 'darwin' || !c.settings.apple?.installer) {
    c.say(`sign-apple: ${pkgs.length} macOS packages are unsigned: ${process.platform !== 'darwin' ? 'they are signed on a Mac' : 'the settings name no Apple identity'}`)
    return
  }
  for (const pkg of pkgs) {
    const signed = `${pkg}.signed`
    done('productsign', ['--sign', c.settings.apple.installer, pkg, signed], 'productsign')
    rmSync(pkg)
    cpSync(signed, pkg)
    rmSync(signed)
    if (c.settings.apple.profile) {
      done('xcrun', ['notarytool', 'submit', pkg, '--keychain-profile', c.settings.apple.profile, '--wait'], 'notarytool')
      done('xcrun', ['stapler', 'staple', pkg], 'stapler')
    } else c.say(`sign-apple: ${pkg} is signed, and not notarised: the settings name no profile`)
  }
}
