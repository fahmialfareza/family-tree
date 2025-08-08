import { defineConfig } from "tsup";

export default defineConfig({
  minify: true,
  entry: ["src/index.ts"],
  splitting: false,
  clean: true,
  sourcemap: "inline",
});
