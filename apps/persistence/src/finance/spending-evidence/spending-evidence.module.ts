import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { SpendingEvidenceRepository } from "./spending-evidence.repository";

@Module({
  imports: [DatabaseModule],
  providers: [SpendingEvidenceRepository],
  exports: [SpendingEvidenceRepository],
})
export class SpendingEvidenceModule {}
