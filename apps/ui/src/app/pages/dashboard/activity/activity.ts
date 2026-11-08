import { Component, computed, inject } from "@angular/core";
import { ButtonDirective } from "primeng/button";
import { Tag } from "primeng/tag";
import { formatClp } from "../../../../utils/currency";
import { TransactionsData } from "../../../features/transactions/transactions.data";
import { TransactionTagSelector } from "./tag-selector/tag-selector";

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Santiago",
});

@Component({
  selector: "dashboard-activity",
  imports: [ButtonDirective, Tag, TransactionTagSelector],
  templateUrl: "./activity.html",
})
export class Activity {
  private readonly data = inject(TransactionsData);
  protected readonly transactions = this.data.recent;
  protected readonly items = this.data.items;

  protected readonly needsTagCount = computed(
    () =>
      this.items().filter(
        (item) => item.tag === null && item.tagDecisionOrigin === "unreviewed",
      ).length,
  );

  protected formattedDate(bookedAt: string): string {
    return dateFormatter.format(new Date(bookedAt));
  }

  protected formattedAmount(amount: string): string {
    return formatClp(amount);
  }
}
