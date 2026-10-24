import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { read, screen } from 'tentjs/ui'
import { allSales } from '../functions'

// A library of charts that draws only in the browser: the server draws the box of its size, and nothing moves.
export const chartsScreen = screen('chartsScreen', {
  path: '/charts',
  access: 'anyone',
  data: { sales: read(allSales) },
  view: ({ sales }) => (
    <div id="lib-card" style={{ width: 480, margin: 16 }}>
      <h2 id="lib-heading" style={{ fontSize: 28 }}>
        Charts heading
      </h2>
      <BarChart id="lib-chart" width={480} height={300} data={sales.map((row) => ({ ...row }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="amount" fill="#8884d8" isAnimationActive={false} />
      </BarChart>
    </div>
  ),
})

// A chart handed data that is no list, which the library's own code fails on as it draws in the browser.
export const chartsFaultScreen = screen('chartsFaultScreen', {
  path: '/charts-fault',
  access: 'anyone',
  server: false,
  view: () => (
    <div>
      <BarChart id="lib-fault" width={480} height={300} data={Object({ notAList: true })}>
        <Bar dataKey="amount" />
      </BarChart>
    </div>
  ),
})
