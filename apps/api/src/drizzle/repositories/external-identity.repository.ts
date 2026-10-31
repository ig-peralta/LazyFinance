import type { AuthPrincipal, VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { externalIdentity } from '../schema/external-identity.table';
import { user } from '../schema/user.table';

function emailConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const pg = 'cause' in error && error.cause ? error.cause : error;
  return typeof pg === 'object' && pg !== null && 'code' in pg && pg.code === '23505'
    && 'constraint_name' in pg && pg.constraint_name === 'user_email_unique';
}

@Injectable()
export class ExternalIdentityRepository {
  constructor(@Inject(DRIZZLE_PG_CLIENT) private readonly db: PostgresJsDatabase<typeof schema>) {}

  async resolveExisting(identity: VerifiedExternalIdentity): Promise<AuthPrincipal> {
    const linked = await this.findLinked(identity);
    if (!linked) throw new UnauthorizedException('External identity is not linked');
    return linked;
  }

  private async findLinked(identity: VerifiedExternalIdentity): Promise<AuthPrincipal | null> {
    if (identity.provider.length > 40 || identity.issuer.length > 512 || identity.providerSubject.length > 256) {
      throw new UnauthorizedException('Invalid external identity');
    }
    const key = and(
      eq(externalIdentity.provider, identity.provider),
      eq(externalIdentity.issuer, identity.issuer),
      eq(externalIdentity.providerSubject, identity.providerSubject),
    );
    const fields = { userId: user.id, email: user.email, name: user.name };
    const [linked] = await this.db.select(fields).from(externalIdentity)
      .innerJoin(user, eq(externalIdentity.userId, user.id)).where(key).limit(1);
    return linked ?? null;
  }

  async resolveOrCreate(identity: VerifiedExternalIdentity): Promise<AuthPrincipal> {
    const existing = await this.findLinked(identity);
    if (existing) return existing;

    const key = and(
      eq(externalIdentity.provider, identity.provider),
      eq(externalIdentity.issuer, identity.issuer),
      eq(externalIdentity.providerSubject, identity.providerSubject),
    );
    const fields = { userId: user.id, email: user.email, name: user.name };

    try {
      return await this.db.transaction(async (tx) => {
        // The mapping row does not exist yet, so a row lock cannot serialize first sign-ins.
        const lockKey = JSON.stringify([identity.provider, identity.issuer, identity.providerSubject]);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        const [linked] = await tx.select(fields).from(externalIdentity)
          .innerJoin(user, eq(externalIdentity.userId, user.id)).where(key).limit(1);
        if (linked) return linked;

        const email = identity.verifiedEmail?.trim().toLowerCase();
        if (!email || email.length > 160) {
          throw new ForbiddenException('A verified email is required for a new user');
        }
        // An email is profile data, not proof that two external subjects own the same finances.
        const [conflict] = await tx.select({ id: user.id }).from(user)
          .where(sql`lower(${user.email}) = ${email}`).limit(1);
        if (conflict) throw new ConflictException('Email already belongs to another user');

        const [created] = await tx.insert(user).values({
          email,
          name: identity.displayName?.trim().slice(0, 120) || email.slice(0, 120),
        }).returning(fields);
        await tx.insert(externalIdentity).values({
          provider: identity.provider,
          issuer: identity.issuer,
          providerSubject: identity.providerSubject,
          userId: created.userId,
        });
        return created;
      });
    } catch (error) {
      if (emailConflict(error)) throw new ConflictException('Email already belongs to another user');
      throw error;
    }
  }
}
