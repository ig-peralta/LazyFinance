import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  type RpcOutput,
  rpcFailure,
  setupRpc,
  tag,
} from "../../../testing/rpc";
import { createScopedCommand } from "./scoped-command";

@Component({
  selector: "scoped-command-host",
  template: "{{ command.error() }}",
})
class CommandHost {
  readonly record = signal("first");
  readonly command = createScopedCommand(this.record);
  readonly saved = signal(0);

  save() {
    return this.command.run(
      (scope, signal) =>
        scope.client.tags.create.mutate({ name: "Prueba" }, { signal }),
      () => this.saved.update((value) => value + 1),
    );
  }
}

describe("explicit management command lifetimes", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("aborts obsolete record-selection work and cannot publish its result to another editor", async () => {
    const response = deferred<RpcOutput<"tags.create">>();
    const mock = setupRpc({ "tags.create": () => response.promise });
    const fixture = TestBed.createComponent(CommandHost);
    fixture.detectChanges();
    const pending = fixture.componentInstance.save();
    await vi.waitFor(() => expect(mock.callsTo("tags.create")).toHaveLength(1));
    fixture.componentInstance.record.set("second");
    fixture.detectChanges();
    response.resolve(tag);
    await pending;
    expect(mock.callsTo("tags.create")[0].options?.signal?.aborted).toBe(true);
    expect(fixture.componentInstance.saved()).toBe(0);
    expect(fixture.componentInstance.command.success()).toBeNull();
  });

  it("does not automatically replay an ambiguous failure or preserve it for another record", async () => {
    const mock = setupRpc({ "tags.create": () => rpcFailure() });
    const fixture = TestBed.createComponent(CommandHost);
    fixture.detectChanges();
    await fixture.componentInstance.save();
    fixture.detectChanges();
    expect(mock.callsTo("tags.create")).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain(
      "Recarga para comprobar si se guardó",
    );
    fixture.componentInstance.record.set("another");
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Recarga para comprobar",
    );
  });
});
