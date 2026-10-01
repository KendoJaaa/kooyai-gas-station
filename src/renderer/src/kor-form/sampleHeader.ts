import type { StationIdentity } from '../../../shared/station'

export type KorFormHeaderValues = {
  period: string
  printedAt: string
  operatorName: string
  stationName: string
  taxId: string
  address: string
  branch: string
}

export const KOR_FORM_TITLE = 'รายงานแสดงรายละเอียดการขายน้ำมันเชื้อเพลิงแต่ละชนิด'

export const EMPTY_KOR_HEADER: KorFormHeaderValues = {
  period: '',
  printedAt: '',
  operatorName: '',
  stationName: '',
  taxId: '',
  address: '',
  branch: ''
}

export function korHeaderFrom(
  identity: StationIdentity | undefined,
  period: string,
  printedAt: string
): KorFormHeaderValues {
  return {
    period,
    printedAt,
    operatorName: identity?.operatorName ?? '',
    stationName: identity?.stationName ?? '',
    taxId: identity?.taxId ?? '',
    address: identity?.address ?? '',
    branch: identity?.branch ?? ''
  }
}
