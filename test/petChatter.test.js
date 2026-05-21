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
    PET_CHAT_INTERVAL_MS
  } = await loadPetChatter()

  assert.equal(PET_CHAT_INTERVAL_MS, 60 * 1000)
  assert.equal(PET_CHAT_BUBBLE_DURATION_MS, 7000)
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

test('pet chatter waits when a reminder or bubble is already visible', async () => {
  const { shouldShowPetChat } = await loadPetChatter()

  assert.equal(shouldShowPetChat({ hasPendingReminder: false, bubbleVisible: false }), true)
  assert.equal(shouldShowPetChat({ hasPendingReminder: true, bubbleVisible: false }), false)
  assert.equal(shouldShowPetChat({ hasPendingReminder: false, bubbleVisible: true }), false)
})
