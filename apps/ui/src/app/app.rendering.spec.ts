import "@angular/compiler";
import { REQUEST } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import {
  provideServerRendering,
  renderApplication,
} from "@angular/platform-server";
import { RenderMode } from "@angular/ssr";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { appConfig } from "./app.config";
import { serverRoutes } from "./app.routes.server";
import { RPC_FETCH } from "./core/rpc/rpc-client";
import { FirebaseService } from "./services/firebase/firebase.service";

describe("public prerender and private CSR boundaries", () => {
  it("prerenders only the public root, including client-only security/deep-link routes", () => {
    expect(serverRoutes).toEqual([
      { path: "", renderMode: RenderMode.Prerender },
      { path: "**", renderMode: RenderMode.Client },
    ]);
  });

  it.each([
    "/",
    "/dashboard",
    "/seguridad",
  ])("renders public content or a neutral frame at %s without identity/API requests", async (path) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("Rendering must not contact the API");
    });
    const init = vi.fn(async () => {
      throw new Error("Rendering must not initialize Firebase");
    });
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          App,
          {
            providers: [
              ...appConfig.providers,
              provideServerRendering(),
              {
                provide: REQUEST,
                useValue: new Request(`http://localhost${path}`, {
                  headers: {
                    cookie: "lazyfinance-session=UNTRUSTED_PRIVATE_TOKEN",
                  },
                }),
              },
              { provide: RPC_FETCH, useValue: fetch },
              { provide: FirebaseService, useValue: { init } },
            ],
          },
          context,
        ),
      {
        document:
          "<!doctype html><html><body><app-root></app-root></body></html>",
        url: `http://localhost${path}`,
        allowedHosts: ["localhost"],
      },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(html).not.toContain("UNTRUSTED_PRIVATE_TOKEN");
    expect(html).not.toContain("workspace-sidebar");
    if (path === "/") expect(html).toContain("Iniciar sesión");
    else expect(html).toContain("Preparando tu espacio");
  });
});
