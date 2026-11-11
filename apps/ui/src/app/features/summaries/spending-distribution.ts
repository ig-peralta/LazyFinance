import type { MonthlySummary } from "@lazyfinance/contracts";
import { moneyCents } from "../../../utils/currency";

const palette = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185"];
const percent = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

function decimal(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/** Exact net amounts first; only bounded SVG coordinates/percentages use Number. */
export function spendingDistribution(
  data: Pick<MonthlySummary, "spending" | "tags">,
) {
  const tags = data.tags
    .map((tag) => ({ ...tag, cents: moneyCents(tag.amount) }))
    .sort(
      (left, right) =>
        (right.cents > left.cents ? 1 : right.cents < left.cents ? -1 : 0) ||
        left.name.localeCompare(right.name),
    );
  const total = moneyCents(data.spending);
  const tagged = tags.reduce((sum, tag) => sum + tag.cents, 0n);
  const consistent =
    total >= 0n && tagged <= total && tags.every((tag) => tag.cents >= 0n);
  const positive = tags.filter((tag) => tag.cents > 0n);
  const groups = positive.slice(0, 5).map((tag, index) => ({
    key: tag.id,
    name: tag.name,
    amount: tag.amount,
    cents: tag.cents,
    color: palette[index],
  }));
  if (positive.length > 5) {
    const cents = positive.slice(5).reduce((sum, tag) => sum + tag.cents, 0n);
    groups.push({
      key: "other",
      name: "Otras etiquetas",
      amount: decimal(cents),
      cents,
      color: "#2dd4bf",
    });
  }
  if (consistent && tagged < total) {
    groups.push({
      key: "untagged",
      name: "Sin etiqueta",
      amount: decimal(total - tagged),
      cents: total - tagged,
      color: "#94a3b8",
    });
  }

  let cumulative = 0n;
  const segments =
    consistent && total > 0n
      ? groups.map(({ cents, ...group }) => {
          const offset = Number((cumulative * 10000n) / total) / 100;
          cumulative += cents;
          const end = Number((cumulative * 10000n) / total) / 100;
          const tenths = (cents * 1000n + total / 2n) / total;
          return {
            ...group,
            offset,
            width: end - offset,
            percentage:
              tenths === 0n
                ? "<0,1%"
                : `${percent.format(Number(tenths) / 10)}%`,
          };
        })
      : [];

  return {
    tags,
    consistent,
    segments,
    grouped: positive.length > 5,
    untagged: consistent ? decimal(total - tagged) : null,
  };
}
