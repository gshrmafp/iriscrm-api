import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env';
import { UnauthorizedError, ConflictError, NotFoundError, ForbiddenError } from '../../core/errors/AppError';
import { getEffectivePermissions } from '../../core/rbac/effectivePermissions';
import { AuthUser } from '../../core/middleware/types';
import { generateId } from '../../core/utils/idGenerator';
import { ROLE_DEFAULT_PERMISSIONS, CROSS_REGION_ROLES } from '../../config/permissions';
import { identityRepository } from './repository';
import {
  CreateRegionInput,
  CreateUserInput,
  ListUsersQuery,
  LoginInput,
  PermissionOverrideInput,
  UpdateRegionInput,
  UpdateUserInput,
  UpdateUserStatusInput,
} from './dto';

function signAccessToken(user: { id: string; role: Role; regionId: string }) {
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: user.id, role: user.role, regionId: user.regionId }, env.JWT_ACCESS_SECRET, options);
}

function signRefreshToken(user: { id: string }) {
  const options: jwt.SignOptions = { expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: user.id }, env.JWT_REFRESH_SECRET, options);
}

export const identityService = {
  async login(input: LoginInput) {
    const user = await identityRepository.findUserByEmail(input.email);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Invalid credentials');

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) throw new UnauthorizedError('Invalid credentials');

    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, regionId: user.regionId },
    };
  },

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await identityRepository.findUserById(payload.sub);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('User no longer active');

    return { accessToken: signAccessToken(user) };
  },

  // Admin (Super Admin, or Regional Admin within own region) creates a user.
  async createUser(actor: AuthUser, input: CreateUserInput) {
    const region = await identityRepository.findRegionById(input.regionId);
    if (!region) throw new NotFoundError('Region not found');

    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== input.regionId) {
      throw new ForbiddenError('Cannot create a user outside your own region');
    }

    const existing = await identityRepository.findUserByEmail(input.email);
    if (existing) throw new ConflictError('Email already in use');

    const passwordHash = await argon2.hash(input.password);
    const id = await generateId('USER');
    const user = await identityRepository.createUser({ ...input, id, passwordHash });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  },

  async listRegions() {
    return identityRepository.listRegions();
  },

  async createRegion(input: CreateRegionInput) {
    const existing = await identityRepository.listRegions();
    if (existing.some((r) => r.code === input.code)) throw new ConflictError('Region code already exists');
    return identityRepository.createRegion(input);
  },

  async updateRegion(id: string, input: UpdateRegionInput) {
    const region = await identityRepository.findRegionById(id);
    if (!region) throw new NotFoundError('Region not found');
    return identityRepository.updateRegion(id, input);
  },

  async listUsers(actor: AuthUser, filters: ListUsersQuery) {
    const where = CROSS_REGION_ROLES.includes(actor.role) ? {} : { regionId: actor.regionId };
    return identityRepository.listUsersPaginated(where, filters);
  },

  // Minimal read-only directory (id/name/email/role, region-scoped) for
  // teammate lookup — @mentions, assignment pickers, timeline name display.
  // Unlike listUsers() above, this needs no IDENTITY_USER_MANAGE permission:
  // every authenticated user may look up their own region's people, they just
  // can't manage them.
  async listUserDirectory(actor: AuthUser) {
    const where = CROSS_REGION_ROLES.includes(actor.role) ? {} : { regionId: actor.regionId };
    return identityRepository.listUsers(where);
  },

  async getEffectivePermissions(userId: string) {
    const user = await identityRepository.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const effective = await getEffectivePermissions(user.id, user.role);
    const overrides = await identityRepository.listOverridesForUser(user.id);
    const roleDefaults = ROLE_DEFAULT_PERMISSIONS[user.role] || [];
    return { role: user.role, roleDefaults, effectivePermissions: [...effective], overrides };
  },

  // Feature-level permission override: admin grants or revokes ONE permission for
  // ONE user, independent of their role defaults. Regional Admin may only manage
  // users within their own region; Super Admin may manage anyone.
  async setPermissionOverride(actor: AuthUser, targetUserId: string, input: PermissionOverrideInput) {
    const target = await identityRepository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== target.regionId) {
      throw new ForbiddenError('Cannot manage permissions for a user outside your own region');
    }

    return identityRepository.upsertOverride({
      userId: targetUserId,
      permissionKey: input.permissionKey,
      effect: input.effect,
      grantedById: actor.id,
      reason: input.reason,
      expiresAt: input.expiresAt,
    });
  },

  async removePermissionOverride(actor: AuthUser, targetUserId: string, permissionKey: string) {
    const target = await identityRepository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== target.regionId) {
      throw new ForbiddenError('Cannot manage permissions for a user outside your own region');
    }

    await identityRepository.deleteOverride(targetUserId, permissionKey);
  },

  // Activate/deactivate a user. Regional Admin may only manage users within
  // their own region; Super Admin may manage anyone. A user may never
  // deactivate themselves — that would lock them out with no way back in.
  async updateUserStatus(actor: AuthUser, targetUserId: string, input: UpdateUserStatusInput) {
    const target = await identityRepository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== target.regionId) {
      throw new ForbiddenError('Cannot manage a user outside your own region');
    }
    if (target.id === actor.id) {
      throw new ForbiddenError('You cannot change your own account status');
    }

    const updated = await identityRepository.updateUserStatus(targetUserId, input.status);
    const { passwordHash: _omit, ...safeUser } = updated;
    return safeUser;
  },

  // Regional Admin may only view users within their own region; Super Admin
  // may view anyone.
  async getUser(actor: AuthUser, targetUserId: string) {
    const target = await identityRepository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User not found');
    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== target.regionId) {
      throw new ForbiddenError('Cannot view a user outside your own region');
    }
    const { passwordHash: _omit, ...safeUser } = target;
    return safeUser;
  },

  // Edit a user's profile fields. Same region-scoping as updateUserStatus;
  // moving a user to a *different* region additionally requires a
  // cross-region role (mirrors createUser's region restriction). Status is
  // deliberately not editable here — see updateUserStatus.
  async updateUser(actor: AuthUser, targetUserId: string, input: UpdateUserInput) {
    const target = await identityRepository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User not found');

    if (!CROSS_REGION_ROLES.includes(actor.role) && actor.regionId !== target.regionId) {
      throw new ForbiddenError('Cannot manage a user outside your own region');
    }

    if (input.regionId && input.regionId !== target.regionId) {
      if (!CROSS_REGION_ROLES.includes(actor.role)) {
        throw new ForbiddenError('Only an Admin can move a user to another region');
      }
      const region = await identityRepository.findRegionById(input.regionId);
      if (!region) throw new NotFoundError('Region not found');
    }

    if (input.email && input.email !== target.email) {
      const existing = await identityRepository.findUserByEmail(input.email);
      if (existing && existing.id !== targetUserId) throw new ConflictError('Email already in use');
    }

    const updated = await identityRepository.updateUser(targetUserId, input);
    const { passwordHash: _omit, ...safeUser } = updated;
    return safeUser;
  },
};
