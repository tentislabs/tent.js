import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[21-10] a screen whose file imports useMicrophone opens the microphone in its description, and the pages of an app with no unlock answer microphone=(self) and nothing else of the device', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'microphoned') })
  closing(t, () => app.close())
  const { screens } = app.description
  assert.deepEqual(Reflect.get(Object(screens.recordScreen), 'opens'), { microphone: true })
  assert.equal(
    Reflect.get(Object(screens.homeScreen), 'opens'),
    undefined,
    'a screen that records nothing opens nothing',
  )
  // A move between screens needs no new headers: every page of the app opens what one of its screens needs.
  for (const path of ['/record', '/'])
    assert.equal(
      (await app.as('nobody').page(path)).headers['permissions-policy'],
      'camera=(), microphone=(self), geolocation=()',
      path,
    )
})
