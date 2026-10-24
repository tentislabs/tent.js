import { useState } from 'react'
import { avg, between, calc, ceil, contains, dayOf, each, earlier, floor, join, later, least, lower, max, min, most, range, read, round, screen, slice, startsWith, sum, trim, upper, where, concat, Link } from 'tentjs/ui'
import { allOrders } from './functions'

// Each value word that a view may hold, once, as the screen below holds them beside a state of React.
export const wordsScreen = screen('wordsScreen', {
  path: '/words',
  access: 'anyone',
  data: { orders: read(allOrders) },
  view: ({ orders }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span id="words">{concat('n', orders.length, true)}</span>
      <span id="calc">{calc('*', 6, 7)}</span>
      <span id="round">{round(sum(orders, 'total') / 3, 1)}</span>
      <span id="floor">{floor(2.7)}</span>
      <span id="ceil">{ceil(2.1)}</span>
      <span id="least">{least(5, 2, 9)}</span>
      <span id="most">{most(5, 2, 9)}</span>
      <span id="lower">{lower('AbC')}</span>
      <span id="upper">{upper('AbC')}</span>
      <span id="trim">[{trim('  x  ')}]</span>
      <span id="startsWith">{startsWith('Ankara', 'an') ? 'yes' : 'no'}</span>
      <span id="contains">{contains(['a', 'b'], 'b') ? 'yes' : 'no'}</span>
      <span id="slice">{slice('abcdef', 1, -1)}</span>
      <span id="join">{join(range(1, 4), '-')}</span>
      <span id="range">{join(range(10, 0, -3), ' ')}</span>
      <span id="where">{where(orders, { paid: true }).length}</span>
      <span id="sum">{sum(orders, 'total')}</span>
      <span id="avg">{avg(orders, 'total')}</span>
      <span id="min">{min(orders, 'total')}</span>
      <span id="max">{max(orders, 'total')}</span>
      <span id="each">{join(each(orders, (o) => o.total * 2), ',')}</span>
      <span id="later">{later('2026-01-31', '1 month')}</span>
      <span id="earlier">{earlier('2026-03-01', '1 day')}</span>
      <span id="between">{between('2026-01-31', '2026-02-28', 'months')}</span>
      <span id="dayOf">{dayOf('2026-10-08T22:30:00.000Z')}</span>
      <Link to="/stateful" id="toStateful">The second screen</Link>
    </div>
  ),
})

// The same words, in a view that keeps a state of React of its own.
export const statefulScreen = screen('statefulScreen', {
  path: '/stateful',
  access: 'anyone',
  data: { orders: read(allOrders) },
  view: ({ orders }) => {
    const [shown] = useState(true)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span id="words">{concat('n', orders.length, shown)}</span>
        <span id="calc">{calc('*', 6, 7)}</span>
        <span id="round">{round(sum(orders, 'total') / 3, 1)}</span>
        <span id="floor">{floor(2.7)}</span>
        <span id="ceil">{ceil(2.1)}</span>
        <span id="least">{least(5, 2, 9)}</span>
        <span id="most">{most(5, 2, 9)}</span>
        <span id="lower">{lower('AbC')}</span>
        <span id="upper">{upper('AbC')}</span>
        <span id="trim">[{trim('  x  ')}]</span>
        <span id="startsWith">{startsWith('Ankara', 'an') ? 'yes' : 'no'}</span>
        <span id="contains">{contains(['a', 'b'], 'b') ? 'yes' : 'no'}</span>
        <span id="slice">{slice('abcdef', 1, -1)}</span>
        <span id="join">{join(range(1, 4), '-')}</span>
        <span id="range">{join(range(10, 0, -3), ' ')}</span>
        <span id="where">{where(orders, { paid: true }).length}</span>
        <span id="sum">{sum(orders, 'total')}</span>
        <span id="avg">{avg(orders, 'total')}</span>
        <span id="min">{min(orders, 'total')}</span>
        <span id="max">{max(orders, 'total')}</span>
        <span id="each">{join(each(orders, (o) => o.total * 2), ',')}</span>
        <span id="later">{later('2026-01-31', '1 month')}</span>
        <span id="earlier">{earlier('2026-03-01', '1 day')}</span>
        <span id="between">{between('2026-01-31', '2026-02-28', 'months')}</span>
        <span id="dayOf">{dayOf('2026-10-08T22:30:00.000Z')}</span>
        <Link to="/words" id="toWords">The first screen</Link>
      </div>
    )
  },
})
