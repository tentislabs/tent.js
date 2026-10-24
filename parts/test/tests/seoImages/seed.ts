import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.products.add({ title: 'A red lamp', color: '#ff0000' })
})
