import { isPlatformServer } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { RecentTransaction, TagSuggestion, TagSummary } from '@lazyfinance/contracts';
import { ButtonDirective } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../services/api/api.service';
import { SessionService } from '../../../../services/session/session.service';

export type TagSelection = {
  transactionId: string;
  tag: TagSummary | null;
  origin: RecentTransaction['tagDecisionOrigin'];
};

@Component({
  selector: 'transaction-tag-selector',
  imports: [ButtonDirective, Card, InputText, Tag],
  templateUrl: './tag-selector.html',
})
export class TransactionTagSelector implements OnInit {
  readonly transaction = input.required<RecentTransaction>();
  readonly tagChanged = output<TagSelection>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLDivElement>>('panel');
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  protected readonly opened = signal(false);
  protected readonly availableTags = signal<TagSummary[]>([]);
  protected readonly suggestion = signal<TagSuggestion | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly autoForMerchant = signal(false);
  protected readonly loadingTags = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly matchingTags = computed(() => {
    const search = this.searchTerm().trim().toLocaleLowerCase('es-CL');
    return this.availableTags().filter((tag) => tag.name.toLocaleLowerCase('es-CL').includes(search));
  });
  protected readonly canCreateTag = computed(() => {
    const name = this.searchTerm().trim();
    return name.length > 0 && name.length <= 80 &&
      !this.availableTags().some((tag) => tag.name.toLocaleLowerCase('es-CL') === name.toLocaleLowerCase('es-CL'));
  });
  private tagsLoaded = false;

  ngOnInit(): void {
    if (!this.isServer) void this.loadSuggestion();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onOutsidePointerDown(event: PointerEvent): void {
    if (this.opened() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.opened()) {
      this.close();
      this.trigger()?.nativeElement.focus();
    }
  }

  protected async togglePicker(): Promise<void> {
    if (this.opened()) {
      this.close();
      return;
    }
    this.opened.set(true);
    this.searchTerm.set('');
    this.autoForMerchant.set(false);
    this.error.set(null);
    // The panel lives below its button in the document flow. If the button is
    // near the bottom of the viewport, scroll enough to expose the panel.
    setTimeout(() => this.revealBelow(), 0);
    if (this.tagsLoaded || this.loadingTags()) return;
    this.loadingTags.set(true);
    try {
      this.availableTags.set(await firstValueFrom(this.api.getTags()));
      this.tagsLoaded = true;
    } catch (error) {
      await this.handleError(error);
    } finally {
      this.loadingTags.set(false);
    }
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
    const tag = this.availableTags().find((item) => item.id === suggestion.tagId) ??
      { id: suggestion.tagId, name: suggestion.tagName, color: null };
    await this.applyTag(tag, false);
  }

  protected async chooseTag(tag: TagSummary | null): Promise<void> {
    await this.applyTag(tag, true);
  }

  protected async createAndTag(): Promise<void> {
    if (!this.canCreateTag() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const tag = await firstValueFrom(this.api.createTag(this.searchTerm().trim()));
      this.availableTags.update((items) => items.some((item) => item.id === tag.id) ? items : [...items, tag]);
      await this.persistTag(tag, true);
    } catch (error) {
      await this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async resetTagDecision(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.resetTagDecision(this.transaction().id));
      this.tagChanged.emit({ transactionId: this.transaction().id, tag: null, origin: 'unreviewed' });
      this.close();
      setTimeout(() => void this.loadSuggestion(), 0);
    } catch (error) {
      await this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadSuggestion(): Promise<void> {
    const transaction = this.transaction();
    if (transaction.tag || transaction.tagDecisionOrigin !== 'unreviewed') return;
    try {
      const [suggestion] = await firstValueFrom(this.api.getTagSuggestions(transaction.id));
      if (this.transaction().tagDecisionOrigin === 'unreviewed') this.suggestion.set(suggestion ?? null);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
      }
    }
  }

  private async applyTag(tag: TagSummary | null, allowAuto: boolean): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.persistTag(tag, allowAuto);
    } catch (error) {
      await this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private async persistTag(tag: TagSummary | null, allowAuto: boolean): Promise<void> {
    const transaction = this.transaction();
    let decisionSaved = false;
    try {
      await firstValueFrom(this.api.setTagDecision(transaction.id, tag?.id ?? null));
      this.tagChanged.emit({ transactionId: transaction.id, tag, origin: 'manual' });
      this.suggestion.set(null);
      decisionSaved = true;
      if (allowAuto && this.autoForMerchant() && tag && transaction.merchant) {
        await firstValueFrom(this.api.createTagRule({
          tagId: tag.id, accountId: transaction.account.id, direction: transaction.type,
          matchField: 'merchant', matchValue: transaction.merchant, priority: 0, autoApply: true,
        }));
      }
      this.close();
    } catch (error) {
      if (decisionSaved && !(error instanceof HttpErrorResponse && error.status === 401)) {
        this.error.set('La etiqueta se guardó, pero no pudimos crear la regla automática.');
      } else {
        throw error;
      }
    }
  }

  private revealBelow(): void {
    if (!this.opened()) return;
    const bottom = this.panel()?.nativeElement.getBoundingClientRect().bottom;
    if (bottom && bottom > window.innerHeight - 12) {
      window.scrollBy({ top: bottom - window.innerHeight + 12, behavior: 'smooth' });
    }
  }

  private close(): void {
    this.opened.set(false);
    this.autoForMerchant.set(false);
  }

  private async handleError(error: unknown): Promise<void> {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.session.clear();
      await this.router.navigateByUrl('/login');
      return;
    }
    this.error.set('No pudimos actualizar la etiqueta. Inténtalo nuevamente.');
  }
}
