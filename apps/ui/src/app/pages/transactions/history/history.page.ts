import { Component, computed, effect, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { AccountsData } from "../../../features/accounts/accounts.data";
import { TagsData } from "../../../features/tags/tags.data";
import { HistoryData } from "../../../features/transactions/history.data";
import { Icon } from "../../../shared/ui/icon";
import { emptyHistoryFields, historyInput } from "./history-filters";

@Component({
  selector: "history-page",
  imports: [FormsModule, RouterLink, Icon],
  providers: [HistoryData, AccountsData, TagsData],
  templateUrl: "./history.page.html",
})
export class HistoryPage {
  protected readonly data = inject(HistoryData);
  protected readonly accounts = inject(AccountsData).accounts;
  protected readonly tags = inject(TagsData).tags;
  protected readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected fields = emptyHistoryFields();
  protected readonly error = signal<string | null>(null);
  protected readonly filtersOpen = signal(false);
  protected readonly activeFilters = computed(
    () =>
      [
        "account",
        "from",
        "before",
        "tag",
        "direction",
        "internal",
        "merchant",
      ].filter((key) => {
        const value = this.query().get(key);
        return !!value && value !== "all";
      }).length,
  );
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
    effect(() => {
      const query = this.query();
      this.fields = {
        account: query.get("account") ?? "",
        from: query.get("from") ?? "",
        before: query.get("before") ?? "",
        tag: query.get("tag") ?? "all",
        direction: query.get("direction") ?? "all",
        internal: query.get("internal") ?? "all",
        merchant: query.get("merchant") ?? "",
      };
      const parsed = historyInput(this.fields);
      this.data.apply(parsed.success ? parsed.data : undefined);
      this.error.set(
        parsed.success
          ? null
          : "Los filtros del enlace no son válidos. Revisa las fechas y las selecciones.",
      );
    });
  }

  protected apply() {
    if (!historyInput(this.fields).success) {
      this.error.set(
        "Revisa el rango: desde se incluye y hasta se excluye. El comercio admite hasta 120 caracteres.",
      );
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.fields,
    });
  }

  protected reset() {
    this.fields = emptyHistoryFields();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}
