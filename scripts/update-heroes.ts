import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

interface OpenDotaHero {
  id: number
  name: string
  localized_name: string
  primary_attr: 'str' | 'agi' | 'int' | 'all'
  attack_type: string
  roles: string[]
}

interface HeroSeed {
  id: number
  name: string
  localizedName?: string
  cn?: string
  roles: string[]
  tags?: string[]
  attribute?: string
  positions?: string[]
}

const OUTPUT_DIR = path.resolve('packages/shared/src/data')
const FALLBACK_PATH = path.join(OUTPUT_DIR, 'fallback.json')
const ATTR_BY_ID_PATH = path.join(OUTPUT_DIR, 'attribute-by-id.json')

function fetchHeroes(): Promise<OpenDotaHero[]> {
  return new Promise((resolve, reject) => {
    https
      .get('https://api.opendota.com/api/heroes', (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Unexpected status code: ${res.statusCode}`))
          res.resume()
          return
        }
        res.setEncoding('utf8')
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          try {
            const data = JSON.parse(raw) as OpenDotaHero[]
            resolve(data)
          } catch (err) {
            reject(err)
          }
        })
      })
      .on('error', reject)
  })
}

function mapAttribute(attr: OpenDotaHero['primary_attr']): HeroSeed['attribute'] {
  switch (attr) {
    case 'str':
      return 'str'
    case 'agi':
      return 'agi'
    case 'int':
      return 'int'
    case 'all':
      return 'allAttr'
    default:
      return 'allAttr'
  }
}

function buildSeeds(openHeroes: OpenDotaHero[]): HeroSeed[] {
  return openHeroes
    .map((hero) => ({
      id: hero.id,
      name: hero.name.replace('npc_dota_hero_', ''),
      localizedName: hero.localized_name,
      roles: hero.roles,
      attribute: mapAttribute(hero.primary_attr)
    }))
    .sort((a, b) => a.id - b.id)
}

function buildAttrById(seeds: HeroSeed[]) {
  const map: Record<number, string> = {}
  seeds.forEach((seed) => {
    if (seed.attribute) {
      map[seed.id] = seed.attribute
    }
  })
  return map
}

async function main() {
  console.log('Fetching heroes from OpenDota...')
  const heroes = await fetchHeroes()
  console.log(`Fetched ${heroes.length} heroes.`)

  const seeds = buildSeeds(heroes)
  fs.writeFileSync(FALLBACK_PATH, JSON.stringify(seeds, null, 2), 'utf8')
  fs.writeFileSync(ATTR_BY_ID_PATH, JSON.stringify(buildAttrById(seeds), null, 2), 'utf8')
  console.log('Updated fallback.json and attribute-by-id.json')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
