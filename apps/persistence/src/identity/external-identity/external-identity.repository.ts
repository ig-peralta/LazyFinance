import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";

@Injectable()
export class ExternalIdentityRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<Record<string, never>>,
  ) {}
  async resolve(identity: VerifiedExternalIdentity, provision: boolean) {
    const result = await sql<{
      userId: string;
      email: string;
      name: string;
    }>`select * from
      identity.resolve_external_identity(${identity.provider}, ${identity.issuer}, ${identity.providerSubject},
        ${identity.verifiedEmail}, ${identity.displayName}, ${provision})`.execute(
      this.db,
    );
    return result.rows[0];
  }
}
