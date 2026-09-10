import { useEffect, useState, type JSX } from 'react'
import { parseMeter } from './numbers'

export function DecimalInput({
  value,
  onCommit,
  className = 'kor-input',
  ariaLabel
}: {
  value: number | null | undefined
  onCommit: (value: number | null) => void
  className?: string
  ariaLabel?: string
}): JSX.Element {
  const [text, setText] = useState(value ? String(value) : '')

  useEffect(() => {
    setText(value == null || value === 0 ? '' : String(value))
  }, [value])

  return (
    <input
      className={className}
      inputMode="decimal"
      value={text}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (next.trim() === '' ) {
          onCommit(null)
          return
        }
        if (/[.\-]$/.test(next.trim())) return
        const parsed = parseMeter(next)
        if (parsed != null) onCommit(parsed)
      }}
      onBlur={(event) => onCommit(parseMeter(event.target.value))}
    />
  )
}
