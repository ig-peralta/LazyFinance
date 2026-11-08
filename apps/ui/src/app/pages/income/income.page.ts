import { Component, computed, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../utils/currency";
import { formatDate } from "../../../utils/date";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { IncomeData } from "../../features/income/income.data";
import { Icon } from "../../shared/ui/icon";
import { CreditBrowser } from "./credit-browser";
import { ReceiptEditor } from "./receipt-editor";

@Component({
  selector: "income-page",
  imports: [RouterLink, Icon, CreditBrowser, ReceiptEditor],
  providers: [IncomeData],
  templateUrl: "./income.page.html",
})
export class IncomePage {
  protected readonly data = inject(IncomeData);
  protected readonly selected = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
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
      this.data.month.set(value);
      this.selected.set(null);
      this.message.set(null);
    }
  }

  protected saved(message: string) {
    this.message.set(message);
    this.selected.set(null);
    this.data.summary.reload();
  }
}
