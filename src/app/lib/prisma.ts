import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import type { PoolConfig } from '@neondatabase/serverless'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function makeClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  const poolConfig: PoolConfig = { connectionString }
  const adapter = new PrismaNeon(poolConfig)

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
