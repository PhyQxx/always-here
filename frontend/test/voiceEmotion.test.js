const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadVoiceEmotion() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/voiceEmotion.mjs'))
  return import(moduleUrl.href)
}

test('emotionToAnimation maps positive emotions to waving', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('happy'), 'waving')
  assert.equal(emotionToAnimation('laughing'), 'waving')
  assert.equal(emotionToAnimation('loving'), 'waving')
})

test('emotionToAnimation maps sad/angry to failed', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('sad'), 'failed')
  assert.equal(emotionToAnimation('crying'), 'failed')
  assert.equal(emotionToAnimation('angry'), 'failed')
})

test('emotionToAnimation maps thinking to review', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('thinking'), 'review')
  assert.equal(emotionToAnimation('confused'), 'review')
})

test('emotionToAnimation falls back to waiting for unknown / neutral', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('neutral'), 'waiting')
  assert.equal(emotionToAnimation('relaxed'), 'waiting')
  assert.equal(emotionToAnimation('something-not-in-map'), 'waiting')
  assert.equal(emotionToAnimation(undefined), 'waiting')
  assert.equal(emotionToAnimation(''), 'waiting')
})

test('VOICE_PHASE_ANIMATION exposes listening and thinking animations', async () => {
  const { VOICE_PHASE_ANIMATION } = await loadVoiceEmotion()
  assert.equal(VOICE_PHASE_ANIMATION.listening, 'waiting')
  assert.equal(VOICE_PHASE_ANIMATION.thinking, 'review')
  assert.equal(VOICE_PHASE_ANIMATION.idle, 'idle')
  assert.equal(VOICE_PHASE_ANIMATION.speaking, null)
})
