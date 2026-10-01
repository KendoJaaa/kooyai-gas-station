import type { KeyboardEvent } from 'react'

function boxCenter(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function isOnScreen(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
}

export function onEntryKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
  const key = event.key
  if (key !== 'Enter' && key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return
  }

  const target = findEntryTarget(event.currentTarget, key)
  if (!target) return
  event.preventDefault()
  target.focus()
  target.select()
}

export const entryInputProps = {
  'data-entry': '',
  onKeyDown: onEntryKeyDown
}

function findEntryTarget(input: HTMLInputElement, key: string): HTMLInputElement | null {
  const group = input.closest('[data-entry-group]')
  if (!group) return null

  const vertical = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter'
  const forward = key === 'ArrowDown' || key === 'Enter' || key === 'ArrowRight'
  const current = input.getBoundingClientRect()
  if (!isOnScreen(current)) return null
  const origin = boxCenter(current)
  const rowSlack = Math.max(current.height * 0.75, 16)
  const columnSlack = Math.max(current.width * 0.8, 36)

  const candidates = [...group.querySelectorAll<HTMLInputElement>('input[data-entry]')].filter((item) => {
    if (item === input) return false
    const rect = item.getBoundingClientRect()
    if (!isOnScreen(rect)) return false
    const point = boxCenter(rect)
    if (vertical) {
      const sameColumn = Math.abs(point.x - origin.x) <= columnSlack
      return sameColumn && (forward ? point.y > origin.y + 4 : point.y < origin.y - 4)
    }
    const sameRow = Math.abs(point.y - origin.y) <= rowSlack
    return sameRow && (forward ? point.x > origin.x + 4 : point.x < origin.x - 4)
  })

  candidates.sort((a, b) => {
    const aPoint = boxCenter(a.getBoundingClientRect())
    const bPoint = boxCenter(b.getBoundingClientRect())
    if (vertical) return forward ? aPoint.y - bPoint.y : bPoint.y - aPoint.y
    return forward ? aPoint.x - bPoint.x : bPoint.x - aPoint.x
  })

  return candidates[0] ?? null
}
