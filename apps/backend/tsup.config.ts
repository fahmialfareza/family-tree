import { defineConfig } from "tsup";

export default defineConfig((options) => {
  const isBuild = !options.watch;

  return {
    minify: isBuild,
    entry: ["src/index.ts"],
    splitting: !isBuild,
    // onSuccess: !isBuild ? 'node dist' : undefined,
    // onSuccess: 'pnpm start:nr',
    clean: isBuild,
    // sourcemap: isBuild ? 'inline' : undefined,
    sourcemap: "inline",
  };
});
