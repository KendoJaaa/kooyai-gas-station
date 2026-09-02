import { z } from 'zod/v4'
import { FUEL_TYPES } from '../../shared/types'

const fuelValues = FUEL_TYPES.map((item) => item.value) as [
  (typeof FUEL_TYPES)[number]['value'],
  ...(typeof FUEL_TYPES)[number]['value'][]
]

export const recordSchema = z.object({
  stationName: z.string().trim().min(1, { error: 'กรุณากรอกชื่อสถานีน้ำมัน' }),
  fullName: z.string().trim().min(1, { error: 'กรุณากรอกชื่อ-นามสกุล' }),
  recordDate: z.string().min(1, { error: 'กรุณาเลือกวันที่บันทึก' }),
  shiftDate: z.string().min(1, { error: 'กรุณาเลือกวันที่กะงาน' }),
  phone: z
    .string()
    .trim()
    .min(9, { error: 'กรุณากรอกเบอร์โทรศัพท์' })
    .regex(/^[0-9+\-\s]{9,20}$/, { error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' }),
  fuelType: z.enum(fuelValues, { error: 'กรุณาเลือกประเภทน้ำมัน' }),
  liters: z.coerce
    .number({ error: 'กรุณากรอกจำนวนลิตร' })
    .positive({ error: 'จำนวนลิตรต้องมากกว่า 0' }),
  notes: z.string()
})

export type RecordFormValues = z.infer<typeof recordSchema>
