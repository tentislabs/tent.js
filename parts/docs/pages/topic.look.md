# The look of a screen

A screen looks as its CSS makes it: the framework draws no look of its own, so any style file, CSS Module, Tailwind CSS or library of components does it. This page gives one way end to end first, then says how each piece comes in, and where each thing that a design asks for is found.

## One look, end to end

The way these docs recommend for an app of screens: Tailwind CSS through its plugin for Vite, daisyUI for the components, which are written in Tailwind's classes and are CSS alone, Recharts for a chart, `lucide-react` for icons, and Inter from Fontsource. Light and dark follow the device, and every screen shares one style file, one type scale and one spacing scale.

**1. The packages.** Each is installed with `tent add`, which writes it into the project's `package.json` and its lock file, `package-lock.json`, with its install scripts off:

```sh
tent add tailwindcss
tent add @tailwindcss/vite
tent add daisyui
tent add recharts
tent add lucide-react
tent add @fontsource-variable/inter
```

`node_modules/` stays out of git, as the `.gitignore` of `tent new` says. A copy of the project that holds the two files and no `node_modules/` - a clone on another computer, a run of the tests in CI, a sample app of a repository - installs exactly what the lock names with `npm ci --ignore-scripts` in the folder of the project, before `tent check`, `tent build` or `tent test`. Without it the build ends at the first import it cannot find (`code.T1014`).

**2. The settings and the one style file.** Tailwind's plugin goes into `vite.config.ts`, and daisyUI into the style file as a plugin of Tailwind's:

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
```

```css
/* screens/app.css */
@import "tailwindcss";
@plugin "daisyui";

@layer base {
  html {
    font-family: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  }
  /* The page puts the focus on the heading after a move: a place to start reading, not a control. */
  h1:focus {
    outline: none;
  }
  /* What a form tells after its last field, where a failure names no field. */
  form [role="alert"] {
    color: var(--color-error);
    font-size: var(--text-sm);
  }
}
```

daisyUI names its colors by what they are for - `base-100`, `base-200`, `base-300` and `base-content` for the page, `primary`, `error` - and sets each anew for a device that asks for dark, so no class of a screen names a dark color of its own and light and dark change in this one place. The type scale and the spacing scale are Tailwind's own steps, `text-sm` to `text-2xl` and `p-6`, `gap-4`, `space-y-6`: a class that names its size by a step, and never by a number of pixels, keeps every screen on the two scales. Colors and steps of the app's own are written in the style file with Tailwind's `@theme`, and daisyUI's sets of colors are chosen with the `themes` option of daisyUI, `@plugin "daisyui" { themes: light --default, dark --prefersdark; }`: Tailwind's and daisyUI's own documents give each.

**3. The layout that every screen is shown in** imports the font and the style file, so they stand once in every page, and a component for the time a move takes:

```tsx
// components/AppFrame.tsx
import '@fontsource-variable/inter'
import '../screens/app.css'
import { component } from 'tentjs/ui'

export const AppFrame = component('AppFrame', {
  view: ({ children }) => <div className="min-h-dvh bg-base-200 text-base-content">{children}</div>,
})

export const Waiting = component('Waiting', {
  view: () => (
    <p className="flex items-center gap-2 p-6 text-sm">
      <span className="loading loading-spinner loading-sm" /> Loading
    </p>
  ),
})
```

**4. The chart.** Recharts learns nothing of the page on the server: it draws there only the box of the size it is given, and its bars once the page has come alive. The box keeps that height, so nothing on the page moves when it is drawn:

```tsx
// components/SalesChart.tsx
import { Bar, BarChart, Tooltip, XAxis, YAxis } from 'recharts'

export function SalesChart({ rows }: { rows: { month: string; amount: number }[] }) {
  return (
    <div className="h-[240px]">
      <BarChart width={480} height={240} data={rows}>
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="amount" fill="var(--color-primary)" />
      </BarChart>
    </div>
  )
}
```

**5. The screen**, with each of its states:

```tsx
// screens/sales.tsx
import { ShoppingBag } from 'lucide-react'
import { Form, read, role, screen } from 'tentjs/ui'
import { AppFrame, Waiting } from '../components/AppFrame'
import { SalesChart } from '../components/SalesChart'
import { addSale, allSales } from '../functions/sales'

export const salesScreen = screen('salesScreen', {
  path: '/sales',
  title: 'Sales',
  access: role('staff'),
  layout: AppFrame,
  loading: Waiting,
  data: { sales: read(allSales) },
  view: ({ sales, calls }) => (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Sales</h1>
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body">
          <h2 className="card-title">Each month</h2>
          {sales.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-10 text-sm opacity-70">
              <ShoppingBag aria-hidden="true" className="size-6" />
              No sales yet. Add the first one below.
            </p>
          ) : (
            <>
              <SalesChart rows={sales.map((one) => ({ month: one.month, amount: one.amount }))} />
              <table className="table">
                <tbody>
                  {sales.map((one) => (
                    <tr key={one.id} className="hover:bg-base-200">
                      <td>{one.month}</td>
                      <td className="text-right tabular-nums">{one.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>
      <Form id="add" call={addSale} className="card border border-base-300 bg-base-100">
        <div className="card-body gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Month
            <input name="month" className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Amount
            <input name="amount" type="number" className="input" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={calls.add?.busy}>
            {calls.add?.busy && <span className="loading loading-spinner loading-sm" />}
            Add sale
          </button>
        </div>
      </Form>
    </main>
  ),
})
```

| State | Where it is |
|---|---|
| Empty | The view draws it where the rows are none: the words and an icon in the place of the chart and the table |
| Loading | `loading: Waiting` while a move to the screen waits for its data; `calls.add.busy` while the form sends, which the button shows with daisyUI's spinner and by being switched off |
| Error | A field that fails its check is told at the field, a native one by the browser's own words; a failure that names no field is told after the last field of the form, as `form [role="alert"]`, which the style file colors; a screen that fails is the `error` screen (`option.screen.for`) |
| Focus | daisyUI's buttons and fields show a ring for the keyboard (`:focus-visible`); Tailwind's `focus-visible:` gives one to anything else |
| Hover | daisyUI's buttons have their own; a row of the table takes `hover:bg-base-200` |

**What draws where.** Tailwind CSS and daisyUI are CSS, and the icons of `lucide-react` are SVG that the view writes: all of it is in the first HTML, so the page is whole before its code has loaded and with no script. Recharts draws in the browser alone: the first HTML holds its empty box and no bar, and neither a search engine nor a visitor with no script sees the chart, so the table beside it holds the same numbers. A chart that must stand in the first HTML is SVG that the view writes itself, or a library that draws on the server, in a component with `browser: false` so the browser loads none of it (`option.component.browser`). Recharts is heavy, about 480 KB of the page before it is packed: `tent build` and `tent map` tell what each package weighs.

`topic.screens.lists` shows a screen with a search and pages, and the sections below say how each piece comes in on its own.
