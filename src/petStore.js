const fs = require('fs')
const os = require('os')
const path = require('path')

const CODEX_PETS_DIR = path.join(os.homedir(), '.codex', 'pets')
const BUILTIN_PETS_DIR = path.join(__dirname, 'renderer', 'assets', 'pets')

function isSafePetId(petId) {
  return (
    typeof petId === 'string' &&
    petId.length > 0 &&
    !petId.includes('/') &&
    !petId.includes('\\') &&
    !petId.includes('..') &&
    petId !== '.'
  )
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function readPetManifest(petsRoot, folderName) {
  const petDir = path.resolve(petsRoot, folderName)
  const root = path.resolve(petsRoot)
  if (!isInside(root, petDir)) return null

  const manifestPath = path.join(petDir, 'pet.json')
  if (!fs.existsSync(manifestPath)) return null

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const id = typeof manifest.id === 'string' ? manifest.id.trim() : ''
    const spritesheetName = typeof manifest.spritesheetPath === 'string'
      ? manifest.spritesheetPath
      : 'spritesheet.webp'
    if (!isSafePetId(id)) return null

    const spritesheetPath = path.resolve(petDir, spritesheetName)
    if (!isInside(petDir, spritesheetPath)) return null
    if (!fs.existsSync(spritesheetPath)) return null

    return {
      id,
      folderName,
      displayName: typeof manifest.displayName === 'string' ? manifest.displayName : id,
      description: typeof manifest.description === 'string' ? manifest.description : '',
      spritesheetPath
    }
  } catch (error) {
    return null
  }
}

function readPetsFromRoot(petsRoot) {
  if (!fs.existsSync(petsRoot)) return []

  return fs.readdirSync(petsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readPetManifest(petsRoot, entry.name))
    .filter(Boolean)
    .map(pet => ({
      id: pet.id,
      folderName: pet.folderName,
      displayName: pet.displayName,
      description: pet.description
    }))
}

function listPets(petsRoot = CODEX_PETS_DIR, builtInPetsRoot = BUILTIN_PETS_DIR) {
  const byId = new Map()
  for (const pet of readPetsFromRoot(builtInPetsRoot)) {
    byId.set(pet.id, pet)
  }
  for (const pet of readPetsFromRoot(petsRoot)) {
    byId.set(pet.id, pet)
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function findPetInRoot(petsRoot, petId) {
  if (!fs.existsSync(petsRoot)) return null

  const folders = fs.readdirSync(petsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  for (const folderName of folders) {
    const pet = readPetManifest(petsRoot, folderName)
    if (pet && pet.id === petId) return pet
  }

  return null
}

function findPetById(petsRoot = CODEX_PETS_DIR, petId, builtInPetsRoot = BUILTIN_PETS_DIR) {
  if (!isSafePetId(petId)) {
    throw new Error('Invalid pet id')
  }
  return findPetInRoot(petsRoot, petId) || findPetInRoot(builtInPetsRoot, petId)
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'image/webp'
}

function getPetSpritesheetDataUrl(petsRoot = CODEX_PETS_DIR, petId, builtInPetsRoot = BUILTIN_PETS_DIR) {
  const pet = findPetById(petsRoot, petId, builtInPetsRoot)
  if (!pet) {
    throw new Error(`Pet not found: ${petId}`)
  }

  const mimeType = getMimeType(pet.spritesheetPath)
  const data = fs.readFileSync(pet.spritesheetPath).toString('base64')
  return {
    id: pet.id,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data}`
  }
}

module.exports = {
  BUILTIN_PETS_DIR,
  CODEX_PETS_DIR,
  findPetById,
  getPetSpritesheetDataUrl,
  listPets
}
