import { z } from "zod";

export const IdentityResolutionInputSchema = z.strictObject({
  mode: z.enum(["existing", "provision"]),
});
