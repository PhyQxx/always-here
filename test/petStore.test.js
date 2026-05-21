const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  BUILTIN_PETS_DIR,
  findPetById,
  getPetSpritesheetDataUrl,
  listPets
} = require('../src/petStore')

function makeTempPetsRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'always-here-pets-'))
}

function writePet(root, folder, manifest) {
  const petDir = path.join(root, folder)
  fs.mkdirSync(petDir, { recursive: true })
  fs.writeFileSync(path.join(petDir, 'pet.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(petDir, manifest.spritesheetPath || 'spritesheet.webp'), 'sprite-bytes')
}

test('listPets returns valid Codex pet manifests from a pets root', () => {
  const root = makeTempPetsRoot()
  writePet(root, 'hina', {
    id: 'hina',
    displayName: 'Hina',
    description: 'A local pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const pets = listPets(root)

  assert.deepEqual(pets, [{
    id: 'hina',
    folderName: 'hina',
    displayName: 'Hina',
    description: 'A local pet.'
  }])
})

test('findPetById resolves pets by pet.json id even when folder name differs', () => {
  const root = makeTempPetsRoot()
  writePet(root, 'six-paths-obito', {
    id: 'obito',
    displayName: 'Obito',
    description: 'Another local pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const pet = findPetById(root, 'obito')

  assert.equal(pet.id, 'obito')
  assert.equal(pet.folderName, 'six-paths-obito')
  assert.equal(pet.spritesheetPath, path.join(root, 'six-paths-obito', 'spritesheet.webp'))
})

test('getPetSpritesheetDataUrl rejects unsafe pet ids', () => {
  const root = makeTempPetsRoot()

  assert.throws(
    () => getPetSpritesheetDataUrl(root, '..\\secret'),
    /Invalid pet id/
  )
})

test('getPetSpritesheetDataUrl returns a webp data URL for a selected pet', () => {
  const root = makeTempPetsRoot()
  writePet(root, 'hina', {
    id: 'hina',
    displayName: 'Hina',
    description: 'A local pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const result = getPetSpritesheetDataUrl(root, 'hina')

  assert.equal(result.id, 'hina')
  assert.equal(result.mimeType, 'image/webp')
  assert.match(result.dataUrl, /^data:image\/webp;base64,/)
})

test('listPets includes built-in pets when configured pets root is missing', () => {
  const missingRoot = path.join(os.tmpdir(), `missing-pets-${Date.now()}`)
  const builtInRoot = makeTempPetsRoot()
  writePet(builtInRoot, 'hina', {
    id: 'hina',
    displayName: 'Hina',
    description: 'Built in pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const pets = listPets(missingRoot, builtInRoot)

  assert.deepEqual(pets, [{
    id: 'hina',
    folderName: 'hina',
    displayName: 'Hina',
    description: 'Built in pet.'
  }])
})

test('configured pets override built-in pets with the same id', () => {
  const root = makeTempPetsRoot()
  const builtInRoot = makeTempPetsRoot()
  writePet(root, 'custom-hina', {
    id: 'hina',
    displayName: 'Custom Hina',
    description: 'User pet.',
    spritesheetPath: 'spritesheet.webp'
  })
  writePet(builtInRoot, 'hina', {
    id: 'hina',
    displayName: 'Built-in Hina',
    description: 'Built in pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const pets = listPets(root, builtInRoot)
  const pet = findPetById(root, 'hina', builtInRoot)

  assert.equal(pets.length, 1)
  assert.equal(pets[0].displayName, 'Custom Hina')
  assert.equal(pet.folderName, 'custom-hina')
  assert.equal(pet.spritesheetPath, path.join(root, 'custom-hina', 'spritesheet.webp'))
})

test('getPetSpritesheetDataUrl falls back to built-in pets when configured root lacks the pet', () => {
  const root = makeTempPetsRoot()
  const builtInRoot = makeTempPetsRoot()
  writePet(builtInRoot, 'hina', {
    id: 'hina',
    displayName: 'Built-in Hina',
    description: 'Built in pet.',
    spritesheetPath: 'spritesheet.webp'
  })

  const result = getPetSpritesheetDataUrl(root, 'hina', builtInRoot)

  assert.equal(result.id, 'hina')
  assert.equal(result.mimeType, 'image/webp')
  assert.match(result.dataUrl, /^data:image\/webp;base64,/)
})

test('built-in pets directory points at packaged renderer assets', () => {
  assert.equal(BUILTIN_PETS_DIR, path.resolve(__dirname, '../src/renderer/assets/pets'))
})
