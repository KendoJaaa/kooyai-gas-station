import { useEffect } from 'react'

/** Notify only after the committed report and its fonts are ready to print. */
export function usePrintReady(ready: boolean, error: string | null): void {
  useEffect(() => {
    if (!ready && !error) return
    let cancelled = false
    let frame = 0
    void document.fonts.ready.then(() => {
      if (cancelled) return
      frame = requestAnimationFrame(() => window.api?.notifyPrintReady(error ?? undefined))
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [ready, error])
}
