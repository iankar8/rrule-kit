import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/agent.ts"],
  format: ["cjs", "esm"],
  dts: false, // Generated separately via tsc
  clean: true,
  splitting: false,
});
