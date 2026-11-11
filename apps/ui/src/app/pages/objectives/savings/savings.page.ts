import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { AuthCredentials } from "../../../core/auth/auth-credentials";
import { reportWorkspaceReadiness } from "../../../core/rendering/workspace-preparation";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { EditorDrawer } from "../../../shared/ui/editor-drawer";
import { Icon } from "../../../shared/ui/icon";
import { objectivePeriod } from "../forms/objective-form";
import { SavingsEditor } from "./savings-editor/savings-editor";

@Component({
  selector: "savings-page",
  imports: [RouterLink, Icon, SavingsEditor, EditorDrawer],
  templateUrl: "./savings.page.html",
})
export class SavingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly fromOnboarding = computed(
    () => this.query().get("from") === "onboarding",
  );
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
  protected readonly editorOpen = signal(false);
  protected readonly savedId = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly period = objectivePeriod;

  constructor() {
    reportWorkspaceReadiness(this.goals);
    const credentials = inject(AuthCredentials),
      owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.savedId.set(null);
      this.editorOpen.set(false);
    });
  }

  protected created(id: string) {
    this.savedId.set(id);
    this.editorOpen.set(false);
    this.goals.reload();
  }
}
