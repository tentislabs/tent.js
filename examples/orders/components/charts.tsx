import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type Month = { label: string; taken: number; open: number }

// The takings of each month as stacked bars: what came in, and on top what is still open.
export function TakingsChart({
  months,
  money,
  short,
  names,
}: {
  months: readonly Month[]
  money: (cents: number) => string
  short: (cents: number) => string
  names: { taken: string; open: string }
}) {
  return (
    <div className="h-80 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...months]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--color-base-300)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'color-mix(in oklab, var(--color-base-content) 70%, transparent)' }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: 'color-mix(in oklab, var(--color-base-content) 70%, transparent)' }}
            tickFormatter={(value: number) => short(value)}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-base-200)' }}
            formatter={(value, name) => [money(Number(value)), name === 'taken' ? names.taken : names.open]}
            contentStyle={{
              background: 'var(--color-base-100)',
              border: '1px solid var(--color-base-300)',
              borderRadius: 'var(--radius-field)',
              color: 'var(--color-base-content)',
              boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
            }}
            labelStyle={{ color: 'var(--color-base-content)', fontWeight: 600 }}
          />
          <Bar dataKey="taken" stackId="m" fill="var(--color-primary)" isAnimationActive={false} />
          <Bar
            dataKey="open"
            stackId="m"
            fill="color-mix(in oklab, var(--color-primary) 35%, var(--color-base-100))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
