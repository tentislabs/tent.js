import { messages } from 'tentjs/ui'

export default messages('ar', {
  orders: {
    title: 'الطلبات المفتوحة',
    count: { zero: 'لا طلبات', one: 'طلب واحد', two: 'طلبان', few: '{count} طلبات', many: '{count} طلبًا', other: '{count} طلب' },
  },
  greeting: 'مرحبا {name}',
  status: { open: 'مفتوح', paid: 'مدفوع' },
  only: { english: 'Only in English' },
  language: { english: 'English', turkish: 'Türkçe' },
})
