import { useEffect, useRef, useState } from 'react'
import { component, number, useTranslations } from 'tentjs/ui'

const length = 1600

export const CountUp = component('CountUp', {
  props: { to: number() },
  view: ({ to }) => {
    const { format } = useTranslations()
    // The first HTML holds the number as it ends, so a page with no script, and a reader, have it whole.
    const [shown, setShown] = useState(to)
    const place = useRef<HTMLSpanElement>(null)
    useEffect(() => {
      const element = place.current
      if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let frame = 0
      setShown(0)
      const seen = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        seen.disconnect()
        const start = performance.now()
        const step = (moment: number) => {
          const share = Math.min(1, (moment - start) / length)
          setShown(Math.round(to * (1 - (1 - share) ** 3)))
          if (share < 1) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
      })
      seen.observe(element)
      return () => {
        seen.disconnect()
        cancelAnimationFrame(frame)
      }
    }, [to])
    return (
      <span ref={place} className="count-number" data-counted={shown === to ? 'yes' : 'no'}>
        {format(shown, 'number')}
      </span>
    )
  },
})
