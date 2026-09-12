import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".next-release-*/**", "node_modules/**", "coverage/**", "generated/**", "migrations/**", "public/maplibre-gl-*.mjs", "next-env.d.ts"],
  },
  {
    // These React Compiler rules are newly enabled by eslint-config-next 16.
    // Keep the existing lint contract until the affected components are migrated deliberately.
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
export default config;
