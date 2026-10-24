import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { copyOf, heldToProjects, lineWith } from './copies.ts'

const file = 'screens/orders.tsx'

// Each rule of pictures and of the consent of a script, with every mistake of its failing project: a piece of the
// line it stands on, and what the sentence of its finding says. A rule that is a folder is held case by case: its
// findings carry the code of the rule.
const rules: Record<string, [piece: string, says: RegExp][]> = {
  T6025: [
    ['<Image src={state.photo} alt="A photo" />', /`Image`.*neither written nor known/],
    ['<Image src="https://pictures.example.com/a.png" alt="An address" />', /`Image`.*neither written nor known/],
  ],
  T6031: [["consent: 'videos'", /kept in the address/]],
  'T6011/consent': [
    ["consent: 'sounding'", /`consent` names `sounding`, which is not declared/],
    ["consent: 'volume'", /`consent` names the state `volume`, which is no true-or-false state/],
  ],
}

const warnings = ['T6025', 'T6031']

/** Holds each rule to its passing and its failing project: the failing one gives exactly its code, once for each mistake, on its line. */
async function heldTo(held: typeof rules): Promise<void> {
  for (const [name, cases] of Object.entries(held)) {
    const [code = name] = name.split('/')
    const { findings: failing, folder } = await heldToProjects(name)
    const text = readFileSync(join(folder, file), 'utf8')
    const lines = cases.map(([piece]) => lineWith(text, piece))
    assert.ok(!lines.includes(0), `every piece of ${name} is a line of its file`)
    const found = failing.map((one) => `${one.where?.line}: ${one.message}`).join('\n')
    assert.deepEqual(failing.map((one) => one.where?.line).sort(), [...lines].sort(), `${name}:\n${found}`)
    for (const [k, [piece, says]] of cases.entries())
      assert.ok(
        failing.some((one) => one.where?.line === lines[k] && says.test(one.message)),
        `${name}, at ${piece}, says ${says}:\n${found}`,
      )
    for (const one of failing) {
      assert.equal(one.where?.file, file, name)
      assert.ok(one.where?.definition, `a finding of ${name} names its definition`)
      assert.ok(one.message.length > 10 && one.fix, name)
      assert.equal(one.docs, `tent docs ${code}`)
      assert.equal(one.level, warnings.includes(code) ? 'warning' : 'error', name)
    }
  }
}

test('[15-1@8b] [30-7] a picture with no stated size, the consent of a script kept in the address, and a consent that names no true-or-false state are each reported with their code, on their line', async () => {
  await heldTo(rules)
})

test('[15-1@8b] [30-7] the passing projects of the rules of pictures and of consent pass the whole check, the type checker among it', async () => {
  for (const name of Object.keys(rules)) {
    const made = await checkProject(copyOf(join(name, 'pass'), `${name.replace('/', '-')}-pass-typed`))
    assert.deepEqual(
      made.findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`),
      [],
      `the passing project of ${name}`,
    )
  }
})
