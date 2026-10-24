import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.orders.add({ name: 'Ann', total: 1999, placedAt: new Date('2026-10-08T09:30:00.000Z') })
  db.orders.add({ name: 'Bo </script><script>window.pwned = 1</script>', total: 5, placedAt: new Date('2026-10-09T09:30:00.000Z') })
})
