import { globSync } from "fs";
import type { OutputOptions } from "rolldown";

const commonOutput: OutputOptions = {
  preserveModules: true,
  sourcemap: true,
  minify: true,
};

const outputs: OutputOptions[] = [
  {
    dir: "dist/module",
    format: "esm",
    exports: "named",
    ...commonOutput,
  },
  {
    dir: "dist/node",
    format: "cjs",
    entryFileNames: "[name].cjs",
    exports: "named",
    ...commonOutput,
  },
];

export default {
  input: globSync("src/**/*.ts"),
  output: outputs,
};
