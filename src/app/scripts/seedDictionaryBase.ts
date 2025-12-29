import fs from 'node:fs'
import path from 'node:path'
import { WordStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'

const INPUT = path.join(process.cwd(), 'data', 'uk_base_50k.txt')

// тільки кирилиця + апостроф (дві форми апострофа зведемо в одну)
const UA_RE = /^[а-щьюяєіїґ']+$/i

function normalizeWord(raw: string) {
  return (
    raw
      .trim()
      .toLowerCase()
      .replaceAll('’', "'")
      .replaceAll('ʼ', "'")
      // прибираємо наголос/комбінуючі знаки (якщо трапляться)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  )
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(
      `Missing file: ${INPUT}\nDownload it into data/uk_base_50k.txt`
    )
  }

  const lines = fs.readFileSync(INPUT, 'utf8').split('\n')

  const rows: { word: string; status: WordStatus; tags: any[] }[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (!line.trim()) continue
    const [w] = line.split(/\s+/) // беремо лише слово, частоту ігноруємо
    const word = normalizeWord(w || '')
    if (!word) continue
    if (word.length < 2 || word.length > 15) continue
    if (!UA_RE.test(word)) continue
    if (seen.has(word)) continue
    seen.add(word)

    rows.push({ word, status: WordStatus.ACTIVE, tags: [] })
  }

  // batch insert
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    await prisma.dictionaryWord.createMany({
      data: chunk,
      skipDuplicates: true,
    })
    if ((i / BATCH) % 10 === 0) {
      console.log(`Inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
    }
  }

  console.log(`Done. Total prepared: ${rows.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {})
