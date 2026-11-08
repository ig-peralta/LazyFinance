import { Component, input } from "@angular/core";

const paths = {
  overview: "M3 3h7v8H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 15h7v6H3z",
  activity: "M4 6h16 M4 12h16 M4 18h16 M7 3v6 M17 9v6 M9 15v6",
  tag: "M3 4h8l10 10-7 7L3 10V4z M7 8h.01",
  wallet: "M3 7h17v13H3V7z M3 7V4h14v3 M16 12h5v4h-5z",
  target: "M21 12a9 9 0 1 1-9-9 M17 3h4v4 M21 3l-9 9 M16 12a4 4 0 1 1-4-4",
  income: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  bank: "M3 9h18L12 3 3 9z M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 21h18",
  security: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z M8 12l3 3 5-6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M6 18 18 6",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  plus: "M12 5v14 M5 12h14",
  check: "M5 12l4 4L19 6",
  logout: "M9 3H4v18h5 M9 12h12 M16 7l5 5-5 5",
  search: "M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16",
  refresh:
    "M20 10a8 8 0 0 0-14-5L3 8 M3 3v5h5 M4 14a8 8 0 0 0 14 5l3-3 M21 21v-5h-5",
  info: "M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z",
} as const;

export type IconName = keyof typeof paths;

@Component({
  selector: "app-icon",
  template: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="path()" /></svg>`,
  styles: `:host{display:inline-flex;width:1.25rem;height:1.25rem;flex-shrink:0}svg{width:100%;height:100%}`,
})
export class Icon {
  readonly name = input<IconName>("overview");
  protected path() {
    return paths[this.name()];
  }
}
