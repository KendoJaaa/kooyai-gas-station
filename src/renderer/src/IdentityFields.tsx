import type { JSX } from 'react'
import { SimpleGrid, Stack, TextInput } from '@mantine/core'
import type { StationIdentity } from '../../shared/station'

export function IdentityFields({
  identity,
  onChange
}: {
  identity: StationIdentity
  onChange: (patch: Partial<StationIdentity>) => void
}): JSX.Element {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="ชื่อผู้ประกอบการ"
          required
          value={identity.operatorName}
          onChange={(event) => onChange({ operatorName: event.target.value })}
        />
        <TextInput
          label="ชื่อสถานีน้ำมัน"
          required
          value={identity.stationName}
          onChange={(event) => onChange({ stationName: event.target.value })}
        />
        <TextInput
          label="เลขประจำตัวผู้เสียภาษี"
          required
          description="13 หลัก"
          inputMode="numeric"
          value={identity.taxId}
          onChange={(event) => onChange({ taxId: event.target.value })}
        />
        <TextInput
          label="สาขา"
          required
          value={identity.branch}
          onChange={(event) => onChange({ branch: event.target.value })}
        />
      </SimpleGrid>
      <TextInput
        label="ที่อยู่สถานประกอบการ"
        required
        value={identity.address}
        onChange={(event) => onChange({ address: event.target.value })}
      />
    </Stack>
  )
}
