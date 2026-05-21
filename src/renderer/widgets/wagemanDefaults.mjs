export const DEFAULT_WAGEMAN_CONFIG = {
  clockIn: '09:00',
  clockOut: '17:00',
  monthlySalary: '8000',
  workDays: '',
  workDaysAuto: true,
  offWorkStops: {}
}

export function mergeWagemanConfig(input = {}) {
  const clockOut = !input.clockOut || input.clockOut === '18:00'
    ? DEFAULT_WAGEMAN_CONFIG.clockOut
    : input.clockOut
  const monthlySalary = input.monthlySalary
    ? input.monthlySalary
    : DEFAULT_WAGEMAN_CONFIG.monthlySalary

  return {
    ...DEFAULT_WAGEMAN_CONFIG,
    ...input,
    clockOut,
    monthlySalary,
    offWorkStops: { ...(input.offWorkStops || {}) }
  }
}
