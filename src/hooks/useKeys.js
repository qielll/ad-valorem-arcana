import { useEffect, useRef } from 'react'

const HANDLED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace']

export function useKeys(handler) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    const onKey = (e) => {
      // Inputs and selects keep Backspace and the arrows; only Escape/Enter are still ours there.
      const editable = e.target?.closest?.('input, select, textarea')
      if (HANDLED.includes(e.key) && (!editable || e.key === 'Escape' || e.key === 'Enter')) e.preventDefault()
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
