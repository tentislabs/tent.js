import '@fontsource-variable/inter'
import '../screens/app.css'
import { BookOpen, Inbox, LifeBuoy, LogOut } from 'lucide-react'
import { component, Form, Link } from 'tentjs/ui'
import { signOut } from '../functions/signIn'

function Brand() {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-content" aria-hidden="true">
        <LifeBuoy className="size-4.5" strokeWidth={2.2} />
      </span>
      Help desk
    </span>
  )
}

const place =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-base-content/75 hover:bg-base-200 hover:text-base-content aria-[current=page]:bg-accent aria-[current=page]:text-accent-content'

/** The frame of every screen of the staff: the places of the desk beside the work, or above it on a phone. */
export const StaffFrame = component('StaffFrame', {
  view: ({ children }) => (
    <div className="min-h-dvh bg-base-200 text-base-content md:grid md:grid-cols-[15rem_1fr]">
      {/* The rail's column runs the whole height of a long page, and the rail stays in view inside it. */}
      <div className="contents md:block md:border-r md:border-base-300 md:bg-base-100">
        <nav
          className="sticky top-0 z-10 flex flex-col gap-3 border-b border-base-300 bg-base-100 px-4 py-3 md:h-dvh md:gap-6 md:border-b-0 md:px-4 md:py-6"
          aria-label="Help desk"
        >
          <div className="flex items-center justify-between md:px-2">
            <Brand />
            <Form id="signOutTop" call={signOut} className="md:hidden">
              <button type="submit" className="btn btn-ghost btn-sm btn-square" aria-label="Sign out">
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </Form>
          </div>
          <div className="flex gap-1 md:flex-col">
            <Link to="/tickets" className={place}>
              <Inbox className="size-4" aria-hidden="true" />
              Tickets
            </Link>
            <Link to="/guides" className={place}>
              <BookOpen className="size-4" aria-hidden="true" />
              Guides
            </Link>
          </div>
          <Form id="signOut" call={signOut} className="mt-auto hidden md:block">
            <button type="submit" className={`${place} w-full`}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </Form>
        </nav>
      </div>
      <main className="min-w-0 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  ),
})

/** The frame of a screen that stands alone, as the sign-in and the screen where a customer asks: one card. */
export const LoneFrame = component('LoneFrame', {
  view: ({ children }) => (
    <div className="grid min-h-dvh place-items-center bg-base-200 px-4 py-10 text-base-content">
      <main className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        {children}
      </main>
    </div>
  ),
})

/** What a move to a screen shows while it waits for its data. */
export const Waiting = component('Waiting', {
  view: () => (
    <p className="flex items-center gap-2 p-6 text-sm text-base-content/70" role="status">
      <span className="loading loading-spinner loading-sm" aria-hidden="true" /> Loading
    </p>
  ),
})
