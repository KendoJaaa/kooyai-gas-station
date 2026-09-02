import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import dayjs from 'dayjs'
import { FUEL_TYPES, emptyRecord, type StationRecord } from '../../shared/types'
import { RecordPreview } from './RecordPreview'
import { recordSchema, type RecordFormValues } from './schema'

function toDate(value: string): Date | null {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.toDate() : null
}

function toIsoDate(value: Date | string | null): string {
  if (!value) return ''
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : ''
}

export function FormPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savedAt, setSavedAt] = useState<string | undefined>()

  const form = useForm<RecordFormValues>({
    mode: 'controlled',
    initialValues: emptyRecord(),
    validate: zod4Resolver(recordSchema)
  })

  useEffect(() => {
    let cancelled = false

    window.api
      .loadForm()
      .then((data) => {
        if (cancelled || !data) return
        form.setValues({
          stationName: data.stationName,
          fullName: data.fullName,
          recordDate: data.recordDate,
          shiftDate: data.shiftDate,
          phone: data.phone,
          fuelType: data.fuelType,
          liters: data.liters,
          notes: data.notes ?? ''
        })
        setSavedAt(data.savedAt)
      })
      .catch((error: unknown) => {
        notifications.show({
          color: 'red',
          title: 'โหลดข้อมูลไม่สำเร็จ',
          message: error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์ที่บันทึกไว้ได้'
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const preview: StationRecord = {
    ...form.values,
    liters: Number(form.values.liters) || 0,
    savedAt
  }

  const persist = async (): Promise<boolean> => {
    const result = form.validate()
    if (result.hasErrors) {
      notifications.show({
        color: 'yellow',
        title: 'กรอกข้อมูลไม่ครบ',
        message: 'โปรดแก้รายการที่แจ้งเตือนก่อนบันทึก'
      })
      return false
    }

    const parsed = recordSchema.parse(form.values)
    const record: StationRecord = {
      ...parsed,
      savedAt: new Date().toISOString()
    }

    setSaving(true)
    try {
      const response = await window.api.saveForm(record)
      if (!response.ok) {
        notifications.show({ color: 'red', title: 'บันทึกไม่สำเร็จ', message: response.message })
        return false
      }
      setSavedAt(record.savedAt)
      notifications.show({
        color: 'teal',
        title: 'บันทึกแล้ว',
        message: 'เก็บไว้ในเครื่องนี้เท่านั้น ไม่ส่งขึ้นอินเทอร์เน็ต'
      })
      return true
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'บันทึกไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const onExportPdf = async (): Promise<void> => {
    const saved = await persist()
    if (!saved) return

    setExporting(true)
    try {
      const result = await window.api.exportPdf()
      if ('canceled' in result && result.canceled) return
      if (!result.ok) {
        notifications.show({
          color: 'red',
          title: 'ส่งออก PDF ไม่สำเร็จ',
          message: 'message' in result ? result.message : 'เกิดข้อผิดพลาด'
        })
        return
      }
      notifications.show({
        color: 'teal',
        title: 'สร้าง PDF แล้ว',
        message: result.filePath
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>แบบบันทึกสถานีน้ำมัน</Title>
        <Text c="dimmed">ใช้ได้โดยไม่ต้องต่ออินเทอร์เน็ต ข้อมูลอยู่ที่เครื่องนี้เท่านั้น</Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <TextInput
              label="ชื่อสถานีน้ำมัน"
              placeholder="เช่น สถานีน้ำมันลุง..."
              disabled={loading}
              {...form.getInputProps('stationName')}
            />
            <TextInput
              label="ชื่อ-นามสกุล ผู้บันทึก"
              placeholder="ชื่อ นามสกุล"
              disabled={loading}
              {...form.getInputProps('fullName')}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <DatePickerInput
                label="วันที่บันทึก"
                placeholder="เลือกวันที่"
                valueFormat="D MMMM BBBB"
                locale="th"
                disabled={loading}
                value={toDate(form.values.recordDate)}
                onChange={(value) => form.setFieldValue('recordDate', toIsoDate(value as Date | string | null))}
                error={form.errors.recordDate}
              />
              <DatePickerInput
                label="วันที่กะงาน"
                placeholder="เลือกวันที่"
                valueFormat="D MMMM BBBB"
                locale="th"
                disabled={loading}
                value={toDate(form.values.shiftDate)}
                onChange={(value) => form.setFieldValue('shiftDate', toIsoDate(value as Date | string | null))}
                error={form.errors.shiftDate}
              />
            </SimpleGrid>
            <TextInput
              label="เบอร์โทรศัพท์"
              placeholder="08x-xxx-xxxx"
              disabled={loading}
              {...form.getInputProps('phone')}
            />
            <Select
              label="ประเภทน้ำมัน"
              data={FUEL_TYPES.map((item) => ({ value: item.value, label: item.label }))}
              disabled={loading}
              allowDeselect={false}
              {...form.getInputProps('fuelType')}
            />
            <NumberInput
              label="จำนวนลิตร"
              placeholder="0"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              disabled={loading}
              {...form.getInputProps('liters')}
            />
            <Textarea
              label="หมายเหตุ"
              placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              minRows={3}
              disabled={loading}
              {...form.getInputProps('notes')}
            />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" loading={saving} disabled={loading} onClick={() => void persist()}>
                บันทึก
              </Button>
              <Button loading={exporting || saving} disabled={loading} onClick={() => void onExportPdf()}>
                ส่งออก PDF
              </Button>
            </Group>
          </Stack>
        </Paper>

        <div>
          <Text mb="sm" fw={600}>
            ตัวอย่างเอกสาร
          </Text>
          <RecordPreview record={preview} compact />
        </div>
      </SimpleGrid>
    </Stack>
  )
}
