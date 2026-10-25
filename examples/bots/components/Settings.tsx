import type { ReactNode } from 'react'
import { Link, useGoTo } from 'tentjs/ui'
import { CloseButton, Dialog } from './Dialog'
import { BarsIcon, GearIcon, ScreenIcon } from './icons'

/** Settings as a dialog over the window: a list at the left, each group a dark rounded box under a small heading. */
export function Settings({ title, children }: { title: string; children: ReactNode }) {
  const goTo = useGoTo()
  const close = () => goTo('/bots')
  return (
    <Dialog label="Settings" onClose={close} className="settings">
      <nav className="settings-nav" aria-label="Settings">
        <Link to="/settings" exact keep>
          <GearIcon /> General
        </Link>
        <Link to="/settings/computer" keep>
          <ScreenIcon /> Computer
        </Link>
        <Link to="/used" keep>
          <BarsIcon /> Usage &amp; Billing
        </Link>
      </nav>
      <section className="settings-main">
        <h1>{title}</h1>
        {children}
      </section>
      <CloseButton onClose={close} />
    </Dialog>
  )
}

export function Group({ heading, children }: { heading?: string; children: ReactNode }) {
  return (
    <>
      {heading && <h2>{heading}</h2>}
      <div className="box">{children}</div>
    </>
  )
}

/** One row of a group: its title and line at the left, what it is set to at the right. */
export function Row({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  return (
    <div className="box-row">
      <span className="box-words">
        <span className="box-title">{title}</span>
        {line && <span className="box-line">{line}</span>}
      </span>
      {children}
    </div>
  )
}

/** A switch that shows what is so, and is changed where `onChange` is given. */
export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange?: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={on}
      aria-label={label}
      disabled={!onChange}
      onClick={() => onChange?.(!on)}
    />
  )
}
