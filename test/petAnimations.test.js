const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadAnimations() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petAnimations.mjs'))
  return import(moduleUrl.href)
}

test('animation definitions include Codex action rows beyond idle', async () => {
  const { ANIMATIONS } = await loadAnimations()

  assert.equal(ANIMATIONS.idle.row, 0)
  assert.equal(ANIMATIONS.waving.row, 3)
  assert.equal(ANIMATIONS.jumping.row, 4)
  assert.equal(ANIMATIONS.waiting.row, 6)
  assert.equal(ANIMATIONS.review.row, 8)
})

test('pickAmbientAction chooses non-idle actions and avoids immediate repeats', async () => {
  const { AMBIENT_ACTIONS, pickAmbientAction } = await loadAnimations()

  assert.ok(AMBIENT_ACTIONS.every(action => action !== 'idle'))
  assert.equal(pickAmbientAction('waving', () => 0), 'jumping')
})

test('getFrameSource returns standard 192x208 atlas coordinates', async () => {
  const { getFrameSource } = await loadAnimations()

  assert.deepEqual(getFrameSource('waving', 2), {
    sx: 384,
    sy: 624,
    sw: 192,
    sh: 208
  })
})

test('getDragAction maps horizontal drag direction to Codex running rows', async () => {
  const { getDragAction } = await loadAnimations()

  assert.equal(getDragAction(12), 'runningRight')
  assert.equal(getDragAction(-12), 'runningLeft')
  assert.equal(getDragAction(3), null)
})

test('getDragActionFromMovement falls back to total drag distance', async () => {
  const { getDragActionFromMovement } = await loadAnimations()

  assert.equal(getDragActionFromMovement(1, 20), 'runningRight')
  assert.equal(getDragActionFromMovement(-1, -20), 'runningLeft')
  assert.equal(getDragActionFromMovement(0, 2), null)
})
