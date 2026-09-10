export function formatMeter(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })
}

export function formatBaht(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function parseMeter(raw: string): number | null {
  const trimmed = raw.replace(/,/g, '').trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
