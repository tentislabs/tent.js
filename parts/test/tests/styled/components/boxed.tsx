import type { ReactNode } from 'react'
import './boxed.css'

// A plain React component that only the component drawn on the server alone draws, with a style file of its own.
export function Boxed({ children }: { children: ReactNode }) {
  return (
    <div className="boxed" id="boxed">
      {children}
      <span>The marker of the box</span>
    </div>
  )
}
