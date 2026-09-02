export const FUEL_TYPES = [
  { value: 'gasohol95', label: 'แก๊สโซฮอล์ 95' },
  { value: 'gasohol91', label: 'แก๊สโซฮอล์ 91' },
  { value: 'e20', label: 'แก๊สโซฮอล์ E20' },
  { value: 'diesel', label: 'ดีเซล' }
] as const

export type FuelType = (typeof FUEL_TYPES)[number]['value']

export interface StationRecord {
  stationName: string
  fullName: string
  recordDate: string
  shiftDate: string
  phone: string
  fuelType: FuelType
  liters: number
  notes: string
  savedAt?: string
}

export const emptyRecord = (): StationRecord => ({
  stationName: '',
  fullName: '',
  recordDate: '',
  shiftDate: '',
  phone: '',
  fuelType: 'gasohol95',
  liters: 0,
  notes: ''
})

export type SaveResult = { ok: true } | { ok: false; message: string }

export type PdfResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled: true }
  | { ok: false; message: string }
