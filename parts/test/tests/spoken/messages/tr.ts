import { messages } from 'tentjs/ui'

// `only.english` is left out: the page shows the English word in its place.
export default messages('tr', {
  orders: { title: 'Açık siparişler', count: { one: '{count} sipariş', other: '{count} sipariş' } },
  greeting: 'Merhaba {name}',
  status: { open: 'Açık', paid: 'Ödendi' },
  language: { english: 'English', turkish: 'Türkçe' },
  tent: { required: 'Bu gerekli.' },
})
