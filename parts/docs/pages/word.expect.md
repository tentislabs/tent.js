# `expect`

Holds a page of a test to what the project keeps of it: a picture, and what a screen reader hears.

## Example

```ts
import test from 'node:test'
import { expect, testApp } from 'tentjs/test'

test('the orders look as they did', async () => {
  const app = await testApp()
  const page = await app.open('/orders', { size: [390, 844] })
  await expect(page).looks('orders')
  await expect(page).heard('orders')
  await app.close()
})
```

## Returns

`expect(page)` takes a page that `app.open` of a test app answered, and answers its two holds, each a promise:

- `looks(name, { share })` takes a picture of the page and holds it against `tests/looks/<engine>/<name>.png` of the project: a pixel differs where one of its four numbers differs by more than 8 of 255, and the picture passes where no more than `share` of its pixels differ, one in a hundred where it is left out.
- `heard(name)` holds what a screen reader hears, as `page.reader()` answers it, against `tests/heard/<engine>/<name>.txt`.

Where nothing is kept yet, and where the page differs, the hold fails as not approved and writes the new one beside, as `<name>.new.png` or `<name>.new.txt`. Look at it, and keep the new ones with `tent test --looks update`.

## Errors

`code.T0013`: a page that no `app.open` of a test app answered.

## See also

`topic.tests`, `word.testApp`, `command.test`
