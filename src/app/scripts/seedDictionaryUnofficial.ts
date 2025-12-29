import { prisma } from '@/app/lib/prisma'
import fs from 'fs'
import path from 'path'

function normalize(word: string) {
  return word.toLowerCase().trim().replace(/’/g, "'")
}

async function main() {
  const filePath = path.join(process.cwd(), 'data/dictionary_unofficial.txt')

  const raw = fs.readFileSync(filePath, 'utf8')
  const words = raw.split('\n').map(normalize).filter(Boolean)

  const unique = Array.from(new Set(words))

  console.log(`Seeding ${unique.length} unofficial words…`)

  await prisma.dictionaryWord.createMany({
    data: unique.map((word) => ({
      word,
      status: 'ACTIVE',
    })),
    skipDuplicates: true,
  })

  console.log('✅ Done')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
