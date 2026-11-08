import { Component, effect, inject, input, output } from "@angular/core";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { reportWorkspaceReadiness } from "../../../core/rendering/workspace-preparation";
import { HistoryData } from "../../../features/transactions/history.data";

@Component({
  selector: "income-credit-browser",
  providers: [HistoryData],
  templateUrl: "./credit-browser.html",
})
export class CreditBrowser {
  readonly month = input.required<string>();
  readonly selected = output<string>();
  protected readonly data = inject(HistoryData);
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
    reportWorkspaceReadiness(this.data.page);
    effect(() => {
      const month = this.month(),
        year = Number(month.slice(0, 4)),
        number = Number(month.slice(5));
      const next =
        number === 12
          ? `${year + 1}-01`
          : `${year}-${String(number + 1).padStart(2, "0")}`;
      this.data.apply({
        limit: 10,
        type: "credit",
        isInternalMovement: false,
        bookedFrom: `${month}-01`,
        bookedBefore: `${next}-01`,
      });
    });
  }
}
