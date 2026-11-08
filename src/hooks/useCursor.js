import { useEffect, useLayoutEffect, useState } from 'react'

/**
 * Keeps one "cursor" bar behind the active row. The bar is moved with CSS variables so it slides
 * (transform transition) instead of the row background swapping instantly.
 * Rows must be direct children of `rootRef` (position: relative) and carry data-row="<id>".
 */
export function useCursor(rootRef, activeId, deps = []) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const measure = (reveal) => {
      const el =
        activeId !== null && activeId !== undefined
          ? root.querySelector(`[data-row="${activeId}"]`)
          : null

      if (!el) {
        root.style.setProperty('--cursor-h', '0px')
        return
      }

      root.style.setProperty('--cursor-y', `${el.offsetTop}px`)
      root.style.setProperty('--cursor-h', `${el.offsetHeight}px`)
      if (reveal && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
    }

    measure(true)

    const raf = requestAnimationFrame(() => {
      if (root) {
        root.dataset.ready = 'true' // enable the slide transition after the first placement
      }
    })

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure(false))
        : null

    if (ro) ro.observe(root)

    return () => {
      cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, ...deps])
}

/** Thumb size and position (percent) for the little scroll rail. */
export function useRail(ref, deps = []) {
  const [rail, setRail] = useState({ top: 0, height: 100 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const h = scrollHeight > 0 ? Math.min(1, clientHeight / scrollHeight) : 1
      const t = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0
      setRail({ height: h * 100, top: t * (100 - h * 100) })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) ro.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      if (ro) ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return rail
}
