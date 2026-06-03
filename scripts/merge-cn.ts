import fs from 'node:fs'
import path from 'node:path'

const ORIGINAL_PATH = path.resolve('dota2-draft-assisant/packages/shared/src/data/fallback.json')
const TARGET_PATH = path.resolve('packages/shared/src/data/fallback.json')

const original = JSON.parse(fs.readFileSync(ORIGINAL_PATH, 'utf8')) as Array<{
  id: number
  localizedName?: string
  cn?: string
}>
const target = JSON.parse(fs.readFileSync(TARGET_PATH, 'utf8')) as Array<{
  id: number
  localizedName?: string
  cn?: string
  name: string
  roles: string[]
  attribute?: string
}>

const nameMap = new Map<number, { localizedName?: string; cn?: string }>()
original.forEach((hero) => {
  if (hero.localizedName || hero.cn) {
    nameMap.set(hero.id, {
      localizedName: hero.localizedName,
      cn: hero.cn
    })
  }
})

const merged = target.map((hero) => {
  const names = nameMap.get(hero.id)
  if (names) {
    return {
      ...hero,
      localizedName: names.localizedName ?? hero.localizedName,
      cn: names.cn ?? hero.cn
    }
  }
  return hero
})

fs.writeFileSync(TARGET_PATH, JSON.stringify(merged, null, 2), 'utf8')
console.log(`Merged Chinese names for ${merged.length} heroes.`)
