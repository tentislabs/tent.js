import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { outsideFolderOf, release, released, thisSystem } from './released.ts'

/** Runs a line of PowerShell and answers what it printed. */
function powershell(line: string): string {
  const done = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', line], { encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
  return done.stdout.trim()
}

/**
 * Makes a certificate that signs code, for this test alone: made in the current user's store, written out with
 * its key as a file under the test's folder, and taken out of the store at once. Answers the file and its print.
 */
function testCertificate(folder: string): { pfx: string; password: string; thumbprint: string } {
  const pfx = join(folder, 'test-signing.pfx')
  const password = 'test-only-password'
  const thumbprint = powershell(
    [
      "$c = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Tent.js test signing' -CertStoreLocation Cert:\\CurrentUser\\My",
      `$p = ConvertTo-SecureString -String '${password}' -Force -AsPlainText`,
      `Export-PfxCertificate -Cert $c -FilePath '${pfx}' -Password $p | Out-Null`,
      'Remove-Item -Path ("Cert:\\CurrentUser\\My\\" + $c.Thumbprint)',
      '$c.Thumbprint',
    ].join('; '),
  )
  return { pfx, password, thumbprint }
}

/** The signer of a file as the system's own tool tells it, and whether it says the signature is good. */
function signatureOf(file: string): { status: string; thumbprint: string } {
  const [status, thumbprint] = powershell(
    `$s = Get-AuthenticodeSignature -FilePath '${file}'; $s.Status; if ($s.SignerCertificate) { $s.SignerCertificate.Thumbprint } else { '' }`,
  ).split(/\r?\n/)
  return { status: status.trim(), thumbprint: (thumbprint ?? '').trim() }
}

test('[41-3] the release signs the two Windows programs and its installer with the certificate its settings name, and with none leaves them unsigned and says so', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'signing')
  const out = join(folder, 'out')
  cpSync(rel.out, out, { recursive: true })
  const files = ['windows/tent.exe', 'windows/tentw.exe', `tent-${rel.version}-${thisSystem}.msi`]
    .map((one) => join(out, rel.version, one))
    .filter((one) => existsSync(one))
  if (process.platform !== 'win32') {
    // Elsewhere the step says that it signs Windows files on Windows alone, and changes nothing.
    const said = release(['--version', rel.version, '--out', out, '--step', 'sign-windows'])
    assert.match(said, /unsigned/)
    return
  }
  assert.ok(files.length >= 2, 'the release made the two Windows programs')
  const unsignedSettings = join(folder, 'none.json')
  writeFileSync(unsignedSettings, JSON.stringify({}))
  const none = release([
    '--version',
    rel.version,
    '--out',
    out,
    '--step',
    'sign-windows',
    '--settings',
    unsignedSettings,
  ])
  assert.match(none, /unsigned/)
  for (const file of files) assert.equal(signatureOf(file).status, 'NotSigned')
  const certificate = testCertificate(folder)
  const settings = join(folder, 'settings.json')
  writeFileSync(settings, JSON.stringify({ windows: { pfx: certificate.pfx, password: certificate.password } }))
  release(['--version', rel.version, '--out', out, '--step', 'sign-windows', '--settings', settings])
  for (const file of files) assert.equal(signatureOf(file).thumbprint, certificate.thumbprint, file)
})

test("[41-3] the installers pass the system's own check: on Windows the system says the signature is good and ours, on macOS that the package is signed and notarised", {
  todo:
    process.platform === 'win32'
      ? "owed to the release of the installers, with the owner's Windows code-signing certificate"
      : process.platform === 'darwin'
        ? "owed to the release of the installers, with the owner's Apple developer account and a run on a Mac"
        : false,
}, async () => {
  const rel = await released('1.0.0')
  if (process.platform === 'win32') {
    for (const one of ['windows/tent.exe', 'windows/tentw.exe', `tent-${rel.version}-${thisSystem}.msi`])
      assert.equal(signatureOf(join(rel.folder, one)).status, 'Valid', one)
  } else if (process.platform === 'darwin') {
    const pkg = join(rel.folder, `tent-${rel.version}-${thisSystem}.pkg`)
    assert.equal(spawnSync('pkgutil', ['--check-signature', pkg]).status, 0)
    assert.equal(spawnSync('spctl', ['--assess', '--type', 'install', pkg]).status, 0)
  } else {
    // The Linux installer is a script that holds the fingerprint of the archive of its own version.
    const script = readFileSync(join(rel.folder, 'install.sh'), 'utf8')
    const archive = join(rel.folder, `tent-${rel.version}-${thisSystem}.tar.xz`)
    const print = createHash('sha256').update(readFileSync(archive)).digest('hex')
    assert.match(script, new RegExp(print))
  }
})
