import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { ActionsModule } from "../actions/actions.module";
import { EnvironmentModule } from "../environment/environment.module";
import { EnvironmentService } from "../environment/environment.service";
import { FinancialEvidenceModule } from "../finance/financial-evidence.module";
import { IncomeModule } from "../income/income.module";
import { ObjectivesModule } from "../objectives/objectives.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { SummariesModule } from "../summaries/summaries.module";
import { TaggingModule } from "../transactions/tagging/tagging.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { AssistantHttp } from "./assistant.http";
import { AssistantRpc } from "./assistant.rpc";
import { AssistantService } from "./assistant.service";
import {
  AiSdkAssistantRuntime,
  ASSISTANT_RUNTIME,
  DemonstrationAssistantRuntime,
} from "./assistant-runtime";
import { AssistantVoiceHttp } from "./assistant-voice.http";
import { AssistantVoiceService, VOICE_FETCH } from "./assistant-voice.service";
import { FinancialReads } from "./financial-reads";

@Module({
  imports: [
    EnvironmentModule,
    ActionsModule,
    TaggingModule,
    PersistenceModule,
    AccountsModule,
    TransactionsModule,
    SummariesModule,
    IncomeModule,
    ObjectivesModule,
    FinancialEvidenceModule,
  ],
  controllers: [AssistantHttp, AssistantVoiceHttp],
  providers: [
    FinancialReads,
    AssistantService,
    AssistantRpc,
    AssistantVoiceService,
    {
      provide: VOICE_FETCH,
      useValue: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    {
      provide: ASSISTANT_RUNTIME,
      inject: [EnvironmentService, FinancialReads],
      useFactory: (environment: EnvironmentService, reads: FinancialReads) =>
        environment.get("ASSISTANT_PROVIDER") === "demo"
          ? new DemonstrationAssistantRuntime()
          : new AiSdkAssistantRuntime(environment, reads.tools),
    },
  ],
})
export class AssistantModule {}
