import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AuthUser } from '../../../core/middleware/types';

type Db = Prisma.TransactionClient | typeof prisma;

// Appends to the shared ActivityLog. Pass the transaction client when the
// audited change runs in a transaction so both commit or roll back together.
// Never pass decrypted sensitive values as from/to — log field names instead.
export function audit(
  db: Db,
  params: {
    entityType: string;
    entityId: string;
    action: string;
    actor: AuthUser;
    field?: string;
    from?: unknown;
    to?: unknown;
    remark?: string;
  },
) {
  return db.activityLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actor.id,
      actorRole: params.actor.role,
      field: params.field,
      fromValue: params.from === undefined ? undefined : (params.from as Prisma.InputJsonValue),
      toValue: params.to === undefined ? undefined : (params.to as Prisma.InputJsonValue),
      remark: params.remark,
    },
  });
}
