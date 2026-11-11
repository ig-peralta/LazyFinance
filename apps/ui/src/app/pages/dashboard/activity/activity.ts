import { Component, computed, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { AuthCredentials } from "../../../core/auth/auth-credentials";
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
  imports: [RouterLink, TransactionTagSelector],
  templateUrl: "./activity.html",
})
export class Activity {
  private readonly data = inject(TransactionsData);
  protected readonly transactions = this.data.recent;
  protected readonly items = this.data.items;
  protected readonly expanded = signal(false);
  protected readonly visibleItems = computed(() =>
    this.expanded() ? this.items() : this.items().slice(0, 5),
  );

  protected readonly needsTagCount = computed(
    () =>
      this.items().filter(
        (item) => item.tag === null && item.tagDecisionOrigin === "unreviewed",
      ).length,
  );

  constructor() {
    const credentials = inject(AuthCredentials);
    effect(() => {
      credentials.current();
      this.expanded.set(false);
    });
  }

  protected formattedDate(bookedAt: string): string {
    return dateFormatter.format(new Date(bookedAt));
  }

  protected formattedAmount(amount: string): string {
    return formatClp(amount);
  }
}
