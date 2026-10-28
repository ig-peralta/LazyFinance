import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { RecentTransaction, TagSummary } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../../services/api/api.service';
import { SessionService } from '../../../../services/session/session.service';
import { TransactionTagSelector } from './tag-selector';

const transaction: RecentTransaction = {
  id: '00000000-0000-4000-8000-000000000012',
  bookedAt: '2026-10-14T15:00:00.000Z',
  amount: '-15000.00', type: 'debit', merchant: 'Mercado', description: null,
  account: { id: '00000000-0000-4000-8000-000000000022', alias: 'Cuenta', type: 'checking', currency: 'CLP' },
  tag: null, tagDecisionOrigin: 'unreviewed', tagRuleId: null, reviewStatus: 'clear',
};
const tag: TagSummary = { id: '00000000-0000-4000-8000-000000000031', name: 'Comida', color: '#22AA77' };
const decision = (id: string, tagId: string | null) => ({
  transactionId: id, tagId, origin: 'manual' as const, ruleId: null, decidedAt: '2026-10-15T15:00:00.000Z',
});

describe('TransactionTagSelector', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(movement: RecentTransaction = transaction, api: Partial<ApiService> = {}) {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SessionService, useValue: { clear } },
        { provide: ApiService, useValue: {
          getTags: () => of([tag]), getTagSuggestions: () => of([]),
          ...api,
        } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TransactionTagSelector);
    fixture.componentRef.setInput('transaction', movement);
    const changed = vi.fn();
    fixture.componentInstance.tagChanged.subscribe(changed);
    fixture.detectChanges();
    return { fixture, changed, clear, navigate };
  }

  it('applies an inline suggestion in one click without opening a picker', async () => {
    const setTagDecision = vi.fn((id: string, tagId: string | null) => of(decision(id, tagId)));
    const { fixture, changed } = setup(transaction, {
      getTagSuggestions: () => of([{
        ruleId: '00000000-0000-4000-8000-000000000041', tagId: tag.id,
        tagName: tag.name, confidence: 'high' as const, reason: 'merchant_exact' as const, autoApply: false,
      }]),
      setTagDecision,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-label="Usar sugerencia Comida"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(setTagDecision).toHaveBeenCalledOnce();
    expect(setTagDecision).toHaveBeenCalledWith(transaction.id, tag.id);
    expect(changed).toHaveBeenCalledWith({ transactionId: transaction.id, tag: { id: tag.id, name: tag.name, color: null }, origin: 'manual' });
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses a single choice in the picker for a manual no-tag decision and supports reset', async () => {
    const setTagDecision = vi.fn((id: string, tagId: string | null) => of(decision(id, tagId)));
    const resetTagDecision = vi.fn((id: string) => of({
      transactionId: id, tagId: null, origin: 'unreviewed' as const, ruleId: null, decidedAt: null,
    }));
    const { fixture, changed } = setup(transaction, { setTagDecision, resetTagDecision });
    (fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('top-full')).toBe(true);
    (Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('Dejar sin etiqueta'))!.click();
    await fixture.whenStable();
    expect(changed).toHaveBeenCalledWith({ transactionId: transaction.id, tag: null, origin: 'manual' });
    fixture.componentRef.setInput('transaction', { ...transaction, tagDecisionOrigin: 'manual' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (Array.from(fixture.nativeElement.querySelectorAll('[role="dialog"] button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('Marcar sin revisar'))!.click();
    await fixture.whenStable();
    expect(resetTagDecision).toHaveBeenCalledWith(transaction.id);
    expect(changed).toHaveBeenCalledWith({ transactionId: transaction.id, tag: null, origin: 'unreviewed' });
  });

  it('searches and creates a tag, assigning it with the same action', async () => {
    const created = { id: '00000000-0000-4000-8000-000000000035', name: 'Nuevo gasto', color: null };
    const createTag = vi.fn(() => of(created));
    const setTagDecision = vi.fn((id: string, tagId: string | null) => of(decision(id, tagId)));
    const { fixture, changed } = setup(transaction, {
      getTags: () => of([]), createTag, setTagDecision,
    });
    (fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input[aria-label="Buscar o crear etiqueta"]') as HTMLInputElement;
    search.value = created.name;
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('Crear «Nuevo gasto» y usar'))!.click();
    await fixture.whenStable();
    expect(createTag).toHaveBeenCalledOnce();
    expect(setTagDecision).toHaveBeenCalledWith(transaction.id, created.id);
    expect(changed).toHaveBeenCalledWith({ transactionId: transaction.id, tag: created, origin: 'manual' });
  });

  it('only creates an automatic rule when the user explicitly turns on remembering', async () => {
    const withTag = { ...transaction, tag, tagDecisionOrigin: 'manual' as const };
    const setTagDecision = vi.fn((id: string, tagId: string | null) => of(decision(id, tagId)));
    const createTagRule = vi.fn(() => of(undefined));
    const { fixture } = setup(withTag, { setTagDecision, createTagRule });
    (fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const remember = fixture.nativeElement.querySelector('input[aria-label="Recordar etiqueta para futuros movimientos"]') as HTMLInputElement;
    remember.checked = true;
    remember.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('Activar con Comida'))!.click();
    await fixture.whenStable();
    expect(createTagRule).toHaveBeenCalledWith({
      tagId: tag.id, accountId: transaction.account.id, direction: transaction.type,
      matchField: 'merchant', matchValue: transaction.merchant, priority: 0, autoApply: true,
    });
  });

  it('keeps the panel below its trigger near the bottom and closes it with Escape', async () => {
    const { fixture } = setup();
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const trigger = fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ bottom: window.innerHeight + 80 } as DOMRect);
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(panel.classList.contains('top-full')).toBe(true);
    expect(panel.classList.contains('overflow-y-auto')).toBe(false);
    expect(panel.querySelectorAll('.overflow-y-auto')).toHaveLength(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 92, behavior: 'smooth' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    scrollBy.mockRestore();
  });

  it('preserves a suggestion and shows an error when the one-click assignment fails', async () => {
    const { fixture, changed } = setup(transaction, {
      getTagSuggestions: () => of([{
        ruleId: '00000000-0000-4000-8000-000000000041', tagId: tag.id, tagName: tag.name,
        confidence: 'high' as const, reason: 'merchant_exact' as const, autoApply: false,
      }]),
      setTagDecision: () => throwError(() => new HttpErrorResponse({ status: 503 })),
    });
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-label="Usar sugerencia Comida"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changed).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('No pudimos actualizar la etiqueta');
    expect(fixture.nativeElement.querySelector('button[aria-label="Usar sugerencia Comida"]')).not.toBeNull();
  });
});
