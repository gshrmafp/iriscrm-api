import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  regionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
