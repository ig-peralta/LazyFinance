// A narrow backstop for affirmative "I prepared a request" claims, not a general
// semantic verifier or a pre-playback guard for native audio.
const preparation =
  /(?<!\p{L})(?:preparé|generé|envié|dejé|he preparado|hemos preparado|he generado|he enviado|he dejado)(?!\p{L})[^.!?\n]{0,120}(?:propuesta|solicitud)(?!\p{L})/giu;
const negation = /(?:^|[^\p{L}])(?:no|nunca)(?:\s+(?:la|lo|te))?\s*$/iu;

export function claimsPreparedProposal(text: string) {
  return [...text.matchAll(preparation)].some(
    (match) =>
      !negation.test(
        text.slice(Math.max(0, (match.index ?? 0) - 40), match.index),
      ),
  );
}
