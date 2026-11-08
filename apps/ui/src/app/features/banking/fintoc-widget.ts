import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import { Injectable, inject, PLATFORM_ID } from "@angular/core";

export interface FintocWidgetInstance {
  open(): void;
  destroy(): void;
}

export interface FintocFactory {
  create(options: {
    publicKey: string;
    widgetToken: string;
    onSuccess: (payload: unknown) => void;
    onExit: () => void;
  }): FintocWidgetInstance;
}

interface FintocWindow extends Window {
  Fintoc?: FintocFactory;
}

export interface FintocWidgetOptions {
  publicKey: string;
  widgetToken: string;
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () =>
      reject(new DOMException("Bank authorization cancelled", "AbortError"));
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    void work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** Only provider code is cached. Widget instances/tokens belong to one explicit operation. */
@Injectable({ providedIn: "root" })
export class FintocWidget {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private loading?: Promise<FintocFactory>;

  async authorize(
    options: FintocWidgetOptions,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (!this.browser || signal.aborted)
      throw new DOMException("Bank authorization unavailable", "AbortError");
    const factory = await abortable(this.load(), signal);
    signal.throwIfAborted();

    return new Promise((resolve, reject) => {
      let widget: FintocWidgetInstance | undefined;
      let settled = false;
      const destroy = () => {
        try {
          widget?.destroy();
        } catch {
          /* The provider may already have removed its iframe. */
        }
      };
      const finish = (result: string | null, error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", cancel);
        destroy();
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () =>
        finish(
          null,
          new DOMException("Bank authorization cancelled", "AbortError"),
        );
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }

      try {
        widget = factory.create({
          ...options,
          onSuccess: (payload) => {
            if (
              payload &&
              typeof payload === "object" &&
              "exchangeToken" in payload &&
              typeof payload.exchangeToken === "string" &&
              payload.exchangeToken.length > 0 &&
              payload.exchangeToken.length <= 512
            )
              finish(payload.exchangeToken);
            else
              finish(
                null,
                new Error("Fintoc returned an invalid authorization"),
              );
          },
          onExit: () => finish(null),
        });
        // A synchronous callback must not leave a new iframe alive or open it afterward.
        if (settled) {
          destroy();
          return;
        }
        widget.open();
      } catch {
        finish(null, new Error("Fintoc Widget could not be opened"));
      }
    });
  }

  private load(): Promise<FintocFactory> {
    const view = this.document.defaultView as FintocWindow | null;
    if (view?.Fintoc && typeof view.Fintoc.create === "function")
      return Promise.resolve(view.Fintoc);
    if (this.loading) return this.loading;

    this.loading = new Promise<FintocFactory>((resolve, reject) => {
      const script = this.document.createElement("script");
      script.src = "https://js.fintoc.com/v1/";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.setAttribute("data-lazyfinance-fintoc", "true");
      const finish = (factory?: FintocFactory) => {
        clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        if (factory) resolve(factory);
        else {
          script.remove();
          reject(new Error("Fintoc Widget is unavailable"));
        }
      };
      const timeout = setTimeout(() => finish(), 15_000);
      script.onload = () =>
        finish(
          view?.Fintoc && typeof view.Fintoc.create === "function"
            ? view.Fintoc
            : undefined,
        );
      script.onerror = () => finish();
      this.document.head.append(script);
    }).catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }
}
