import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.news.add({ title: 'First news' })
})
