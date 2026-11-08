import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { AuthCredentials } from "../../../core/auth/auth-credentials";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { Icon } from "../../../shared/ui/icon";
import { objectivePeriod } from "../forms/objective-form";
import { SavingsEditor } from "./savings-editor/savings-editor";

@Component({
  selector: "savings-page",
  imports: [RouterLink, Icon, SavingsEditor],
  templateUrl: "./savings.page.html",
})
export class SavingsPage {
  private readonly rpc = inject(RpcClient);
  protected readonly goals = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.objectives.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly items = computed(() =>
    (this.goals.hasValue() ? this.goals.value() : []).filter(
      (goal) => goal.intent === "saving",
    ),
  );
  protected readonly editorKey = signal(0);
  protected readonly savedId = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly period = objectivePeriod;

  constructor() {
    const credentials = inject(AuthCredentials),
      owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.savedId.set(null);
      this.editorKey.update((key) => key + 1);
    });
  }

  protected created(id: string) {
    this.savedId.set(id);
    this.editorKey.update((key) => key + 1);
    this.goals.reload();
  }
}
