import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TagRepository } from "./tag.repository";
import { TagRpc } from "./tag.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [TagRepository, TagRpc],
  exports: [TagRepository],
})
export class TagModule {}
