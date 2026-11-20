import { seedId } from "./helpers";

export function userFixtureId(userId: string, fixtureId: string) {
  return seedId(`development-account-reset:v1:${userId}:${fixtureId}`);
}
