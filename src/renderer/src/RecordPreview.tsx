import type { JSX } from 'react'
import {
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core'
import type { StationRecord } from '../../shared/types'
import { formatLiters, formatThaiDate, fuelLabel } from './format'

interface RecordPreviewProps {
  record: Partial<StationRecord>
  compact?: boolean
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600}>{value || '—'}</Text>
    </div>
  )
}

export function RecordPreview({ record, compact = false }: RecordPreviewProps): JSX.Element {
  return (
    <Paper
      withBorder
      p={compact ? 'md' : 'xl'}
      radius="md"
      bg="white"
      style={{ minHeight: compact ? undefined : 520 }}
    >
      <Stack gap="lg">
        <div>
          <Text size="sm" c="dimmed">
            แบบบันทึกประจำวัน
          </Text>
          <Title order={3}>{record.stationName || 'สถานีน้ำมัน'}</Title>
          <Group mt="xs" gap="xs">
            <Badge variant="light" color="teal">
              ออฟไลน์ในเครื่องนี้เท่านั้น
            </Badge>
            {record.savedAt ? (
              <Text size="xs" c="dimmed">
                บันทึกล่าสุด {formatThaiDate(record.savedAt)}
              </Text>
            ) : null}
          </Group>
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Row label="ชื่อ-นามสกุล ผู้บันทึก" value={record.fullName ?? ''} />
          <Row label="เบอร์โทรศัพท์" value={record.phone ?? ''} />
          <Row label="วันที่บันทึก" value={formatThaiDate(record.recordDate)} />
          <Row label="วันที่กะงาน" value={formatThaiDate(record.shiftDate)} />
          <Row label="ประเภทน้ำมัน" value={record.fuelType ? fuelLabel(record.fuelType) : ''} />
          <Row label="จำนวนลิตร" value={formatLiters(record.liters)} />
        </SimpleGrid>
        <Row label="หมายเหตุ" value={record.notes?.trim() ? record.notes : 'ไม่มี'} />
      </Stack>
    </Paper>
  )
}
