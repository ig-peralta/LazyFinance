import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { currentMonth } from "../../../../utils/month";
import { AuthCredentials } from "../../../core/auth/auth-credentials";
import {
  initialReadSettled,
  reportWorkspaceReadiness,
} from "../../../core/rendering/workspace-preparation";
import { AccountsData } from "../../../features/accounts/accounts.data";
import { TagsData } from "../../../features/tags/tags.data";
import { HistoryData } from "../../../features/transactions/history.data";
import { Icon, type IconName } from "../../../shared/ui/icon";
import {
  emptyHistoryFields,
  type HistoryFields,
  historyInput,
  historyMonthRange,
} from "./history-filters";

@Component({
  selector: "history-page",
  imports: [FormsModule, RouterLink, Icon, NgTemplateOutlet],
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
  protected readonly applied = computed<HistoryFields>(() => {
    const query = this.query();
    return {
      account: query.get("account") ?? "",
      from: query.get("from") ?? "",
      before: query.get("before") ?? "",
      tag: query.get("tag") ?? "all",
      direction: query.get("direction") ?? "all",
      internal: query.get("internal") ?? "all",
      merchant: query.get("merchant") ?? "",
    };
  });
  protected merchantSearch = "";
  protected draft = emptyHistoryFields();
  protected readonly error = signal<string | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly filtersOpen = signal(false);
  private readonly filterToggle =
    viewChild<ElementRef<HTMLButtonElement>>("filterToggle");
  private readonly filterPanel =
    viewChild<ElementRef<HTMLElement>>("filterPanel");
  private searchBeforeFilters = "";
  protected readonly criteria = computed(() => {
    const fields = this.applied();
    const items: { key: keyof HistoryFields; label: string; icon: IconName }[] =
      [];
    if (fields.merchant.trim())
      items.push({
        key: "merchant",
        label: `Comercio: ${fields.merchant.trim()}`,
        icon: "search",
      });
    if (fields.account)
      items.push({
        key: "account",
        label: this.accountLabel(fields.account),
        icon: "bank",
      });
    if (fields.from)
      items.push({
        key: "from",
        label: `Desde: ${calendarLabel(fields.from)}`,
        icon: "calendar",
      });
    if (fields.before)
      items.push({
        key: "before",
        label: `Antes del: ${calendarLabel(fields.before)}`,
        icon: "calendar",
      });
    if (fields.tag !== "all")
      items.push({
        key: "tag",
        label:
          fields.tag === "untagged"
            ? "Sin etiqueta"
            : this.tagLabel(fields.tag),
        icon: "tag",
      });
    if (fields.direction !== "all")
      items.push({
        key: "direction",
        label:
          fields.direction === "debit"
            ? "Cargos"
            : fields.direction === "credit"
              ? "Abonos"
              : "Dirección no válida",
        icon: "activity",
      });
    if (fields.internal !== "all")
      items.push({
        key: "internal",
        label:
          fields.internal === "internal"
            ? "Internos"
            : fields.internal === "external"
              ? "Externos"
              : fields.internal === "unknown"
                ? "Sin determinar"
                : "Estado no válido",
        icon: "activity",
      });
    return items;
  });
  protected readonly activeFilters = computed(() => this.criteria().length);
  protected readonly directions = [
    { value: "all", label: "Todos", accessible: "Todos los movimientos" },
    { value: "debit", label: "Cargos", accessible: "Solo cargos" },
    { value: "credit", label: "Abonos", accessible: "Solo abonos" },
  ] as const;
  protected readonly periods = [
    { label: "Sin límite", from: "", before: "" },
    { label: "Este mes", ...historyMonthRange(currentMonth()) },
    { label: "Mes anterior", ...historyMonthRange(currentMonth(), -1) },
  ];
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  constructor() {
    reportWorkspaceReadiness(
      this.accounts,
      this.tags,
      () => !!this.error() || initialReadSettled(this.data.page),
    );
    const credentials = inject(AuthCredentials);
    const owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      const fields = this.applied();
      this.merchantSearch = fields.merchant;
      this.searchBeforeFilters = fields.merchant;
      this.draft = { ...fields };
      this.closeFilters();
      const parsed = historyInput(fields);
      this.data.apply(parsed.success ? parsed.data : undefined);
      this.error.set(
        parsed.success
          ? null
          : "Los filtros del enlace no son válidos. Revisa las fechas y las selecciones.",
      );
    });
  }

  protected openFilters() {
    if (this.filtersOpen()) return;
    this.searchBeforeFilters = this.merchantSearch;
    this.draft = { ...this.applied(), merchant: this.merchantSearch };
    this.draftError.set(null);
    this.filtersOpen.set(true);
  }

  protected closeFilters() {
    untracked(() => {
      const panel = this.filterPanel()?.nativeElement;
      if (panel?.contains(panel.ownerDocument.activeElement))
        this.filterToggle()?.nativeElement.focus();
    });
    this.filtersOpen.set(false);
    this.draftError.set(null);
  }

  protected toggleFilters() {
    if (this.filtersOpen()) this.cancelFilters();
    else this.openFilters();
  }

  protected cancelFilters() {
    this.merchantSearch = this.searchBeforeFilters;
    this.draft = { ...this.applied() };
    this.closeFilters();
  }

  protected clearDraft() {
    this.draft = emptyHistoryFields();
    this.merchantSearch = "";
    this.draftError.set(null);
  }

  protected selectPeriod(period: { from: string; before: string }) {
    this.draft.from = period.from;
    this.draft.before = period.before;
    this.draftError.set(null);
  }

  protected search() {
    this.select({
      ...(this.filtersOpen() ? this.draft : this.applied()),
      merchant: this.merchantSearch,
    });
  }

  protected clearSearch() {
    this.merchantSearch = "";
    this.select({
      ...(this.filtersOpen() ? this.draft : this.applied()),
      merchant: "",
    });
  }

  protected direction(direction: HistoryFields["direction"]) {
    this.select({
      ...(this.filtersOpen() ? this.draft : this.applied()),
      merchant: this.merchantSearch,
      direction,
    });
  }

  protected removeFilter(key: keyof HistoryFields) {
    this.select({ ...this.applied(), [key]: emptyHistoryFields()[key] });
  }

  protected apply() {
    this.select({ ...this.draft, merchant: this.merchantSearch });
  }

  private select(fields: HistoryFields) {
    if (!historyInput(fields).success) {
      if (!this.filtersOpen()) this.searchBeforeFilters = this.merchantSearch;
      this.draft = { ...fields };
      this.filtersOpen.set(true);
      this.draftError.set(
        "Revisa el rango: desde se incluye y hasta se excluye. El comercio admite hasta 120 caracteres.",
      );
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        account: fields.account || null,
        from: fields.from || null,
        before: fields.before || null,
        tag: fields.tag === "all" ? null : fields.tag,
        direction: fields.direction === "all" ? null : fields.direction,
        internal: fields.internal === "all" ? null : fields.internal,
        merchant: fields.merchant.trim() || null,
      },
    });
    this.closeFilters();
  }

  protected reset() {
    this.merchantSearch = "";
    this.draft = emptyHistoryFields();
    this.closeFilters();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected hasAccount(id: string) {
    return (
      this.accounts.hasValue() &&
      this.accounts.value().some((account) => account.id === id)
    );
  }

  protected accountLabel(id: string) {
    return (
      (this.accounts.hasValue()
        ? this.accounts.value().find((account) => account.id === id)?.alias
        : null) || "Cuenta seleccionada"
    );
  }

  protected hasTag(id: string) {
    return (
      this.tags.hasValue() && this.tags.value().some((tag) => tag.id === id)
    );
  }

  protected tagLabel(id: string) {
    return (
      (this.tags.hasValue()
        ? this.tags.value().find((tag) => tag.id === id)?.name
        : null) || "Etiqueta seleccionada"
    );
  }
}

function calendarLabel(value: string) {
  const [year, month, day] = value.split("-");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${day}/${month}/${year}` : value;
}
