import type { PersistenceContext as IdentityContext } from "@lazyfinance/contracts/context";
import { createContextVerifier } from "@lazyfinance/rpc-auth";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";

export type PersistenceRequestContext = { identity: IdentityContext };

@Injectable()
export class PersistenceContext implements TRPCContext, OnModuleInit {
  private verifier?: ReturnType<typeof createContextVerifier>;
  private readonly publicKey: string;
  private readonly keyId: string;
  constructor() {
    const key = process.env.PERSISTENCE_RPC_PUBLIC_KEY;
    if (!key) throw new Error("PERSISTENCE_RPC_PUBLIC_KEY is required");
    this.publicKey = key;
    this.keyId = process.env.PERSISTENCE_RPC_KEY_ID ?? "primary";
  }
  private getVerifier() {
    this.verifier ??= createContextVerifier(this.publicKey, this.keyId);
    return this.verifier;
  }
  async onModuleInit() {
    await this.getVerifier();
  }
  async create({ req }: ContextOptions): Promise<PersistenceRequestContext> {
    try {
      return {
        identity: await (await this.getVerifier())(req.headers.authorization),
      };
    } catch {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid service identity",
      });
    }
  }
}
