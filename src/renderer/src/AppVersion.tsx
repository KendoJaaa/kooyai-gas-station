import { Badge } from '@mantine/core'
import type { JSX } from 'react'
import { version } from '../../../package.json'

export function AppVersion(): JSX.Element {
  return (
    <Badge size="lg" variant="filled" radius="sm" style={{ flexShrink: 0 }}>
      {version}
    </Badge>
  )
}
