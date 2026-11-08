import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  HostListener,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import type { RecentTransaction, TagSummary } from "@lazyfinance/contracts";
import { ButtonDirective } from "primeng/button";
import { Card } from "primeng/card";
import { InputText } from "primeng/inputtext";
import { Tag } from "primeng/tag";
import { RpcClient } from "../../../../core/rpc/rpc-client";
import { createTagDecision } from "../../../../features/tagging/tag-decision";
import { TaggingData } from "../../../../features/tagging/tagging.data";

@Component({
  selector: "transaction-tag-selector",
  imports: [ButtonDirective, Card, InputText, Tag],
  templateUrl: "./tag-selector.html",
})
export class TransactionTagSelector {
  readonly transaction = input.required<RecentTransaction>();

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>("trigger");

  private readonly panel = viewChild<ElementRef<HTMLDivElement>>("panel");
  private readonly tagging = inject(TaggingData);
  private readonly decision = createTagDecision(this.transaction);
  private readonly scope = inject(RpcClient).authenticatedScope;
  private revealTimer?: ReturnType<typeof setTimeout>;

  protected readonly opened = signal(false);
  protected readonly horizontalOffset = signal(0);
  protected readonly searchTerm = signal("");
  protected readonly autoForMerchant = signal(false);
  protected readonly saving = this.decision.saving;
  protected readonly suggestion = this.decision.suggestion;
  protected readonly loadingTags = this.tagging.tags.isLoading;

  protected readonly error = computed(
    () =>
      this.decision.error() ??
      (this.opened() && this.tagging.tags.error()
        ? "No pudimos cargar las etiquetas. Inténtalo nuevamente."
        : null),
  );

  private readonly availableTags = computed(() =>
    this.tagging.tags.hasValue() ? this.tagging.tags.value() : [],
  );

  protected readonly matchingTags = computed(() => {
    const search = this.searchTerm().trim().toLocaleLowerCase("es-CL");
    return this.availableTags().filter((tag) =>
      tag.name.toLocaleLowerCase("es-CL").includes(search),
    );
  });

  protected readonly canCreateTag = computed(() => {
    const name = this.searchTerm().trim();
    return (
      name.length > 0 &&
      name.length <= 80 &&
      !this.availableTags().some(
        (tag) =>
          tag.name.toLocaleLowerCase("es-CL") ===
          name.toLocaleLowerCase("es-CL"),
      )
    );
  });

  constructor() {
    effect(() => {
      this.scope();
      this.transaction().id;
      untracked(() => {
        this.close();
        this.searchTerm.set("");
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.revealTimer));
  }

  @HostListener("document:pointerdown", ["$event"])
  protected onOutsidePointerDown(event: PointerEvent): void {
    if (
      this.opened() &&
      !this.host.nativeElement.contains(event.target as Node)
    )
      this.close();
  }

  @HostListener("document:keydown.escape")
  protected onEscape(): void {
    if (!this.opened()) return;

    this.close();
    this.trigger()?.nativeElement.focus();
  }

  protected togglePicker(): void {
    if (this.opened()) {
      this.close();
      return;
    }

    this.opened.set(true);
    this.horizontalOffset.set(0);
    this.searchTerm.set("");
    this.autoForMerchant.set(false);
    this.decision.clearError();
    this.tagging.requestTags();
    this.revealTimer = setTimeout(() => this.revealBelow(), 0);
  }

  protected searchTags(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected toggleAuto(event: Event): void {
    this.autoForMerchant.set((event.target as HTMLInputElement).checked);
  }

  protected async applySuggestion(): Promise<void> {
    const suggestion = this.suggestion();
    if (!suggestion) return;

    const tag = this.availableTags().find(
      (item) => item.id === suggestion.tagId,
    ) ?? {
      id: suggestion.tagId,
      name: suggestion.tagName,
      color: null,
    };
    this.finish(await this.decision.choose(tag, false));
  }

  protected async chooseTag(tag: TagSummary | null): Promise<void> {
    this.finish(await this.decision.choose(tag, this.autoForMerchant()));
  }

  protected async createAndTag(): Promise<void> {
    if (!this.canCreateTag()) return;

    this.finish(
      await this.decision.createAndChoose(
        this.searchTerm().trim(),
        this.autoForMerchant(),
      ),
    );
  }

  protected async resetTagDecision(): Promise<void> {
    this.finish(await this.decision.reset());
  }

  private finish(saved: boolean): void {
    if (saved && !this.decision.error()) this.close();
  }

  private revealBelow(): void {
    if (!this.opened()) return;

    const bounds = this.panel()?.nativeElement.getBoundingClientRect();
    if (
      bounds &&
      Number.isFinite(bounds.left) &&
      Number.isFinite(bounds.right)
    ) {
      const offset = Math.min(0, window.innerWidth - 12 - bounds.right);
      this.horizontalOffset.set(Math.max(offset, 12 - bounds.left));
    }
    const bottom = bounds?.bottom;

    if (bottom && bottom > window.innerHeight - 12) {
      window.scrollBy({
        top: bottom - window.innerHeight + 12,
        behavior: "smooth",
      });
    }
  }

  private close(): void {
    clearTimeout(this.revealTimer);
    const panel = this.panel()?.nativeElement;
    const restoreFocus = panel?.contains(panel.ownerDocument.activeElement);
    this.opened.set(false);
    this.autoForMerchant.set(false);
    if (restoreFocus)
      this.trigger()?.nativeElement.focus({ preventScroll: true });
  }
}
