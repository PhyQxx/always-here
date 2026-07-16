const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadVoiceEmotion() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/voiceEmotion.mjs'))
  return import(moduleUrl.href)
}

test('emotionToAnimation maps positive emotions to rich semantic actions', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('happy'), 'dance')
  assert.equal(emotionToAnimation('laughing'), 'dance')
  assert.equal(emotionToAnimation('loving'), 'cheer')
})

test('emotionToAnimation maps negative emotions to semantic actions', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('sad'), 'failed')
  assert.equal(emotionToAnimation('crying'), 'failed')
  assert.equal(emotionToAnimation('angry'), 'stomp')
})

test('emotionToAnimation maps thinking to review', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('thinking'), 'study')
  assert.equal(emotionToAnimation('confused'), 'nod')
})

test('emotionToAnimation falls back to waiting for unknown / neutral', async () => {
  const { emotionToAnimation } = await loadVoiceEmotion()
  assert.equal(emotionToAnimation('neutral'), 'waiting')
  assert.equal(emotionToAnimation('relaxed'), 'stretch')
  assert.equal(emotionToAnimation('something-not-in-map'), 'waiting')
  assert.equal(emotionToAnimation(undefined), 'waiting')
  assert.equal(emotionToAnimation(''), 'waiting')
})

test('VOICE_PHASE_ANIMATION exposes listening and thinking animations', async () => {
  const { VOICE_PHASE_ANIMATION } = await loadVoiceEmotion()
  assert.equal(VOICE_PHASE_ANIMATION.listening, 'waiting')
  assert.equal(VOICE_PHASE_ANIMATION.thinking, 'study')
  assert.equal(VOICE_PHASE_ANIMATION.idle, 'idle')
  assert.equal(VOICE_PHASE_ANIMATION.speaking, null)
})

test('emotionToEmote adds symbols only for expressive emotions', async () => {
  const { emotionToEmote } = await loadVoiceEmotion()

  assert.equal(emotionToEmote('loving'), '♥')
  assert.equal(emotionToEmote('confused'), '?')
  assert.equal(emotionToEmote('angry'), '💢')
  assert.equal(emotionToEmote('neutral'), null)
})
