// The named step `listings`: the files that winget and Homebrew take for this release. Sending them in is the
// owner's act.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { printOf } from './sign.mjs'

/** The step. A listing names an installer by its address under where releases are served, with its fingerprint. */
export function listings(c) {
  const at = (file) => (c.from ? new URL(`${c.version}/${file}`, c.from.endsWith('/') ? c.from : `${c.from}/`).href : `<address>/${c.version}/${file}`)
  const winget = join(c.out, 'listings', 'winget')
  const brew = join(c.out, 'listings', 'homebrew')
  const msis = c.systems.filter((one) => one.startsWith('win32')).map((one) => ({ system: one, file: `tent-${c.version}-${one}.msi` })).filter((one) => existsSync(join(c.out, one.file)))
  if (msis.length) {
    mkdirSync(winget, { recursive: true })
    const id = 'TentJs.Tent'
    writeFileSync(join(winget, `${id}.yaml`), `PackageIdentifier: ${id}\nPackageVersion: ${c.version}\nDefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.6.0\n`)
    writeFileSync(
      join(winget, `${id}.locale.en-US.yaml`),
      `PackageIdentifier: ${id}\nPackageVersion: ${c.version}\nPackageLocale: en-US\nPublisher: Tent.js\nPackageName: Tent.js\nLicense: MIT\nShortDescription: An open framework for whole apps.\nManifestType: defaultLocale\nManifestVersion: 1.6.0\n`,
    )
    const installers = msis
      .map(
        (one) =>
          `  - Architecture: ${one.system.endsWith('arm64') ? 'arm64' : 'x64'}\n    InstallerType: msi\n    Scope: user\n    InstallerUrl: ${at(one.file)}\n    InstallerSha256: ${printOf(readFileSync(join(c.out, one.file))).toUpperCase()}\n`,
      )
      .join('')
    writeFileSync(
      join(winget, `${id}.installer.yaml`),
      `PackageIdentifier: ${id}\nPackageVersion: ${c.version}\nInstallers:\n${installers}ManifestType: installer\nManifestVersion: 1.6.0\n`,
    )
  } else c.say('listings: no Windows installer was made: no listing for winget')
  const pkgs = c.systems.filter((one) => one.startsWith('darwin')).map((one) => ({ system: one, file: `tent-${c.version}-${one}.pkg` })).filter((one) => existsSync(join(c.out, one.file)))
  if (pkgs.length) {
    mkdirSync(brew, { recursive: true })
    const arm = pkgs.find((one) => one.system.endsWith('arm64'))
    const intel = pkgs.find((one) => one.system.endsWith('x64'))
    const branch = (one) => `    url "${at(one.file)}"\n    sha256 "${printOf(readFileSync(join(c.out, one.file)))}"\n`
    writeFileSync(
      join(brew, 'tent.rb'),
      `cask "tent" do\n  version "${c.version}"\n${arm ? `  on_arm do\n${branch(arm)}  end\n` : ''}${intel ? `  on_intel do\n${branch(intel)}  end\n` : ''}  name "Tent.js"\n  desc "An open framework for whole apps"\n  homepage "https://tentjs.com"\n  pkg "tent-#{version}-#{Hardware::CPU.arm? ? "darwin-arm64" : "darwin-x64"}.pkg"\n  uninstall script: { executable: "#{Dir.home}/.tent/bin/tent", args: ["uninstall"] }\nend\n`,
    )
  } else c.say('listings: no macOS package was made: no listing for Homebrew')
}
