import { Module } from "@nestjs/common";
import { PersistenceModule } from "../../persistence/persistence.module";
import { TagRulesRpc, TagsRpc } from "./tagging.rpc";
import { TaggingService } from "./tagging.service";

@Module({
  imports: [PersistenceModule],
  providers: [TaggingService, TagsRpc, TagRulesRpc],
  exports: [TaggingService],
})
export class TaggingModule {}
