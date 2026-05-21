export const DEFAULT_WAGEMAN_CONFIG = {
  clockIn: '09:00',
  clockOut: '17:00',
  monthlySalary: '8000',
  workDays: '',
  workDaysAuto: true,
  offWorkStops: {}
}

export function mergeWagemanConfig(input = {}) {
  return {
    ...DEFAULT_WAGEMAN_CONFIG,
    ...input,
    offWorkStops: { ...(input.offWorkStops || {}) }
  }
}
