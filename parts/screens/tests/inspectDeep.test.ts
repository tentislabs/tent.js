import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toldOf } from '../page/inspect/elements.ts'
import { placing } from '../page/placed.ts'

test('[34-3] the inspect mode tells an element that one tag drew deep inside a library in one look for each element above it, not one that doubles with each', () => {
  // One tag of a screen file, as a development build hands its place, which draws a run of nested elements.
  const made = placing((type: string, props: object, _key?: string, _static?: boolean, _source?: object) => ({
    type,
    props,
  }))
  Reflect.apply(Reflect.get(globalThis, '__tentTags'), undefined, ['screens/grid.tsx', { '3:5': [10, 40] }])
  const tag = made('Grid', {}, undefined, false, { fileName: '/p/screens/grid.tsx', lineNumber: 3, columnNumber: 5 })
  const use = { memoizedProps: tag.props, type: 'Grid', return: null }
  let looks = 0
  let parent: object | null = null
  let innermost: object | undefined
  for (let depth = 0; depth < 24; depth++) {
    const fiber = { memoizedProps: {}, type: 'div', return: use }
    const element: object = {
      parentElement: parent,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    }
    // What React of development keeps on an element, counted at each look.
    Object.defineProperty(element, '__reactFiber$test', {
      enumerable: true,
      get: () => {
        looks++
        return fiber
      },
    })
    parent = element
    innermost = element
  }
  const told = toldOf(Object(innermost), 'gridScreen')
  assert.deepEqual(told?.place, { file: 'screens/grid.tsx', from: 10, to: 40 })
  assert.ok(looks < 100, `the elements were looked at ${looks} times`)
})
