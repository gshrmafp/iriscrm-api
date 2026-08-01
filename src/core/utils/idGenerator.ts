import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const ID_PREFIXES = {
  USER: 'EMP',
  LEAD: 'LD',
  CATALOG: 'PDT',
  CUSTOMER: 'CUST',
};

/**
 * Generates the next ID for a given entity type (e.g., 'USER' -> 'EMP001')
 */
export async function generateId(entityType: keyof typeof ID_PREFIXES): Promise<string> {
  const prefix = ID_PREFIXES[entityType];
  
  // Use a transaction to safely increment the sequence counter
  const sequence = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequence.upsert({
      where: { id: entityType },
      update: { nextValue: { increment: 1 } },
      create: { id: entityType, nextValue: 2 },
    });
    return seq;
  });

  // Subtract 1 because upsert increments/initializes to nextValue
  // For create: nextValue is 2, so the ID is 1.
  // For update: nextValue goes from 2 -> 3, so the ID is 2.
  const currentVal = sequence.nextValue - 1;

  // Format as 3-digit padded number: 'EMP001'
  return `${prefix}${currentVal.toString().padStart(3, '0')}`;
}
