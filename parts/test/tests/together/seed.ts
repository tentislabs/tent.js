import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.docs.add({ title: 'First', body: 'Start' })
})
