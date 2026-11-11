import { Component, computed, effect, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../utils/currency";
import { formatDate } from "../../../utils/date";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { IncomeData } from "../../features/income/income.data";
import { EditorDrawer } from "../../shared/ui/editor-drawer";
import { Icon } from "../../shared/ui/icon";
import { CreditBrowser } from "./credit-browser/credit-browser";
import { ReceiptEditor } from "./receipt-editor/receipt-editor";

@Component({
  selector: "income-page",
  imports: [RouterLink, Icon, CreditBrowser, ReceiptEditor, EditorDrawer],
  providers: [IncomeData],
  templateUrl: "./income.page.html",
})
export class IncomePage {
  protected readonly data = inject(IncomeData);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly defaultMonth = this.data.month();
  protected readonly selected = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
    this.data.month.set(this.urlMonth());
    effect(() => {
      this.data.month.set(this.urlMonth());
      this.selected.set(null);
      this.message.set(null);
    });
    reportWorkspaceReadiness(this.data.summary);
    const credentials = inject(AuthCredentials),
      owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.selected.set(null);
      this.message.set(null);
    });
  }

  protected month(value: string) {
    if (MonthSchema.safeParse(value).success) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { month: value },
        queryParamsHandling: "merge",
      });
    }
  }

  private urlMonth() {
    const parsed = MonthSchema.safeParse(this.query().get("month"));
    return parsed.success ? parsed.data : this.defaultMonth;
  }

  protected saved(message: string) {
    this.message.set(message);
    this.selected.set(null);
    this.data.summary.reload();
  }
}
