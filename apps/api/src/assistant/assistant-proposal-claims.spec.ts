import { describe, expect, it } from "vitest";
import { claimsPreparedProposal } from "./assistant-proposal-claims";

describe("narrow preparation-claim backstop", () => {
  it.each([
    "Listo, preparé una propuesta de presupuesto mensual para Burger King por 150.000 pesos con inicio el próximo mes.",
    "He preparado la solicitud para que la revises.",
    "Te dejé una propuesta en pantalla.",
  ])("recognizes an affirmative saved-request claim: %s", (text) => {
    expect(claimsPreparedProposal(text)).toBe(true);
  });

  it.each([
    "¿Qué color quieres para la etiqueta?",
    "Puedo preparar una solicitud cuando elijas la etiqueta.",
    "No preparé ninguna propuesta.",
    "No he preparado la solicitud.",
    "Nunca te envié una propuesta.",
  ])("does not treat clarification, future intent or a denial as success: %s", (text) => {
    expect(claimsPreparedProposal(text)).toBe(false);
  });
});
