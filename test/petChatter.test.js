const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadPetChatter() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petChatter.mjs'))
  return import(moduleUrl.href)
}

test('pet chatter speaks once per minute with a short bubble duration', async () => {
  const {
    PET_CHAT_BUBBLE_DURATION_MS,
    PET_CHAT_INTERVAL_MS,
    getPetChatIntervalMs,
    normalizePetChatSettings
  } = await loadPetChatter()

  assert.equal(PET_CHAT_INTERVAL_MS, 60 * 1000)
  assert.equal(PET_CHAT_BUBBLE_DURATION_MS, 7000)
  assert.equal(getPetChatIntervalMs(normalizePetChatSettings({})), 60 * 1000)
  assert.equal(getPetChatIntervalMs(normalizePetChatSettings({ intervalMinutes: 5 })), 5 * 60 * 1000)
})

test('pet chatter settings normalize disabled quiet mode and interval bounds', async () => {
  const { normalizePetChatSettings } = await loadPetChatter()

  assert.deepEqual(normalizePetChatSettings({}), {
    enabled: true,
    intervalMinutes: 1,
    quietMode: false,
    tone: 'companion'
  })
  assert.deepEqual(normalizePetChatSettings({
    enabled: false,
    intervalMinutes: 0,
    quietMode: true,
    tone: 'snark'
  }), {
    enabled: false,
    intervalMinutes: 1,
    quietMode: true,
    tone: 'snark'
  })
  assert.equal(normalizePetChatSettings({ intervalMinutes: 90 }).intervalMinutes, 60)
  assert.equal(normalizePetChatSettings({ tone: 'unknown' }).tone, 'companion')
})

test('pet chatter uses short designed Chinese lines and includes time-of-day flavor', async () => {
  const { getPetChatLines } = await loadPetChatter()

  const morningLines = getPetChatLines(new Date('2026-05-21T08:30:00'))
  const nightLines = getPetChatLines(new Date('2026-05-21T23:30:00'))

  assert.ok(morningLines.includes('早安，我陪你开工。'))
  assert.ok(nightLines.includes('夜深了，收个好尾。'))
  assert.ok(morningLines.length >= 20)
  assert.ok(morningLines.every(line => line.length <= 18))
})

test('pickPetChatLine avoids immediately repeating the previous line when possible', async () => {
  const { pickPetChatLine } = await loadPetChatter()
  const now = new Date('2026-05-21T15:00:00')
  const lines = ['先做最小的一步。', '肩膀放松一下。']

  const picked = pickPetChatLine({
    now,
    previousLine: '先做最小的一步。',
    lines,
    random: () => 0
  })

  assert.equal(picked, '肩膀放松一下。')
})

test('pet chatter supports tone packs and dynamic context lines', async () => {
  const { getPetChatLines, PET_CHAT_TONES } = await loadPetChatter()

  assert.deepEqual(PET_CHAT_TONES.map(tone => tone.id), [
    'companion',
    'focus',
    'snark',
    'offwork'
  ])

  const focusLines = getPetChatLines(new Date('2026-05-21T15:00:00'), {
    tone: 'focus',
    activityContext: {
      missedWaterCount: 2,
      missedSedentaryCount: 1,
      overtimeMinutes: 35
    }
  })

  assert.ok(focusLines.some(line => line.includes('小目标')))
  assert.ok(focusLines.some(line => line.includes('喝水')))
  assert.ok(focusLines.some(line => line.includes('站起来')))
  assert.ok(focusLines.some(line => line.includes('加班')))
})

test('pet chatter waits when a reminder or bubble is already visible', async () => {
  const { shouldShowPetChat } = await loadPetChatter()

  assert.equal(shouldShowPetChat({ hasPendingReminder: false, bubbleVisible: false }), true)
  assert.equal(shouldShowPetChat({ hasPendingReminder: true, bubbleVisible: false }), false)
  assert.equal(shouldShowPetChat({ hasPendingReminder: false, bubbleVisible: true }), false)
  assert.equal(shouldShowPetChat({ enabled: false }), false)
  assert.equal(shouldShowPetChat({ quietMode: true }), false)
})

test('pet chatter can be forced from tray without interrupting pending reminders', async () => {
  const { shouldShowPetChat } = await loadPetChatter()

  assert.equal(shouldShowPetChat({
    enabled: false,
    quietMode: true,
    bubbleVisible: true,
    force: true
  }), true)
  assert.equal(shouldShowPetChat({
    hasPendingReminder: true,
    force: true
  }), false)
})
