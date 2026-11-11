import { definePreset } from "@primeng/themes";
import Aura from "@primeng/themes/aura";

export const Emerald = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{emerald.50}",
      100: "{emerald.100}",
      200: "{emerald.200}",
      300: "{emerald.300}",
      400: "{emerald.400}",
      500: "{emerald.500}",
      600: "{emerald.600}",
      700: "{emerald.700}",
      800: "{emerald.800}",
      900: "{emerald.900}",
      950: "{emerald.950}",
    },
    colorScheme: {
      light: {
        primary: {
          color: "#086b4a",
          contrastColor: "#ffffff",
          hoverColor: "#06583e",
          activeColor: "#04452f",
        },
        text: {
          mutedColor: "{surface.600}",
        },
      },
      dark: {
        primary: {
          color: "#34d399",
          contrastColor: "#052e22",
          hoverColor: "{emerald.300}",
          activeColor: "{emerald.200}",
        },
      },
    },
  },
});
