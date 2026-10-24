import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.products.add({ slug: 'chair', name: 'The chair', summary: 'A chair to sit on' })
  // A row whose text would end a script of the head, and would add an element of a sitemap, where it were not written as text.
  db.products.add({ slug: 'lamp', name: 'Lamp </script><b>bold</b>', summary: 'A lamp & "more" <x>' })
})
