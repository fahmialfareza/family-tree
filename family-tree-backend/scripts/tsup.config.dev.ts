import { defineConfig } from "tsup";

export default defineConfig({
  minify: false,
  entry: ["src/index.ts"],
  splitting: true,
  onSuccess: "node --enable-source-maps -r newrelic ./dist",
  clean: true,
  sourcemap: "inline",
});
