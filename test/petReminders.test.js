const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadReminders() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petReminders.mjs'))
  return import(moduleUrl.href)
}

test('normalizeReminders provides defaults with system notifications disabled', async () => {
  const { normalizeReminders } = await loadReminders()

  const reminders = normalizeReminders({})

  assert.equal(reminders.hourly.enabled, true)
  assert.equal(reminders.hourly.systemNotification, false)
  assert.equal(reminders.water.intervalMinutes, 30)
  assert.equal(reminders.sedentary.intervalMinutes, 60)
})

test('normalizeReminders allows 1 minute custom water and sedentary intervals', async () => {
  const { normalizeReminders } = await loadReminders()

  const reminders = normalizeReminders({
    water: { intervalMinutes: 1, systemNotification: true },
    sedentary: { intervalMinutes: 1, enabled: false }
  })

  assert.equal(reminders.water.intervalMinutes, 1)
  assert.equal(reminders.water.systemNotification, true)
  assert.equal(reminders.sedentary.intervalMinutes, 1)
  assert.equal(reminders.sedentary.enabled, false)
})

test('getDueReminderEvents emits hourly, water, and sedentary reminders when due', async () => {
  const { getDueReminderEvents, minutesAgo } = await loadReminders()
  const now = new Date('2026-05-20T10:00:00')
  const reminders = {
    hourly: { enabled: true, systemNotification: false },
    water: { enabled: true, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: true, intervalMinutes: 45, systemNotification: true },
    work: { enabled: false, systemNotification: false }
  }

  const events = getDueReminderEvents(now, reminders, {
    lastHourlyKey: '2026-05-20T09',
    lastWaterAt: minutesAgo(now, 31),
    lastSedentaryAt: minutesAgo(now, 45),
    firedWorkKeys: new Set()
  }, {})

  assert.deepEqual(events.map(event => event.type), ['hourly', 'water', 'sedentary'])
  assert.equal(events[2].systemNotification, true)
})

test('getDueReminderEvents emits work reminders for clock-in, lunch, off-soon, and clock-out', async () => {
  const { getDueReminderEvents } = await loadReminders()
  const reminders = {
    hourly: { enabled: false, systemNotification: false },
    water: { enabled: false, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: false, intervalMinutes: 60, systemNotification: false },
    work: { enabled: true, systemNotification: true }
  }
  const config = { wageman: { clockIn: '09:00', clockOut: '18:00' } }

  const startEvents = getDueReminderEvents(new Date('2026-05-20T09:00:00'), reminders, {
    firedWorkKeys: new Set()
  }, config)
  const lunchEvents = getDueReminderEvents(new Date('2026-05-20T12:00:00'), reminders, {
    firedWorkKeys: new Set()
  }, config)
  const offSoonEvents = getDueReminderEvents(new Date('2026-05-20T17:50:00'), reminders, {
    firedWorkKeys: new Set()
  }, config)
  const endEvents = getDueReminderEvents(new Date('2026-05-20T18:00:00'), reminders, {
    firedWorkKeys: new Set()
  }, config)

  assert.equal(startEvents[0].type, 'work-start')
  assert.equal(lunchEvents[0].type, 'work-lunch')
  assert.equal(offSoonEvents[0].type, 'work-off-soon')
  assert.equal(endEvents[0].type, 'work-end')
  assert.equal(endEvents[0].systemNotification, true)
})

test('getDueReminderEvents uses 9 to 5 as default work reminder times', async () => {
  const { getDueReminderEvents } = await loadReminders()
  const reminders = {
    hourly: { enabled: false, systemNotification: false },
    water: { enabled: false, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: false, intervalMinutes: 60, systemNotification: false },
    work: { enabled: true, systemNotification: false }
  }

  const offSoonEvents = getDueReminderEvents(new Date('2026-05-20T16:50:00'), reminders, {
    firedWorkKeys: new Set()
  }, {})
  const endEvents = getDueReminderEvents(new Date('2026-05-20T17:00:00'), reminders, {
    firedWorkKeys: new Set()
  }, {})

  assert.equal(offSoonEvents[0].type, 'work-off-soon')
  assert.equal(endEvents[0].type, 'work-end')
})
