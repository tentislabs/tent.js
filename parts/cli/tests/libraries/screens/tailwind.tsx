import './tailwind.css'
import { read, screen } from 'tentjs/ui'
import { allSales } from '../functions'

// Tailwind CSS by its own plugin for Vite, with daisyUI, a library of components written in its classes.
export const tailwindScreen = screen('tailwindScreen', {
  path: '/tailwind',
  access: 'anyone',
  data: { sales: read(allSales) },
  view: ({ sales }) => (
    <div id="lib-card" className="card bg-base-100 w-[480px] m-4 shadow-sm border border-gray-200">
      <div className="card-body">
        <h2 id="lib-heading" className="card-title text-3xl font-bold text-indigo-700">
          Tailwind heading
        </h2>
        <div id="lib-group" className="flex gap-2 mt-4">
          <span id="lib-badge" className="badge badge-secondary">
            {sales.length} months
          </span>
          <button id="lib-button" type="button" className="btn btn-primary">
            Tailwind button
          </button>
        </div>
        <table id="lib-table" className="table table-zebra mt-4">
          <tbody>
            {sales.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-1">{row.month}</td>
                <td className="px-2 py-1">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
})
