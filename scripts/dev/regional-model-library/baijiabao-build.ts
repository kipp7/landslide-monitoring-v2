import { reportFatalError, runPhase1Cli } from "./phase1-run";

const DEFAULT_ARGS = [
  "--dataset-key",
  "Baijiabao-2017-2024",
  "--raw-root",
  ".tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families",
  "--out-root",
  ".tmp/regional-model-library/out/threegorges-baijiabao",
  "--region-code",
  "CN-HB-THREEGORGES",
  "--station-code",
  "Baijiabao",
  "--slope-code",
  "Baijiabao"
] as const;

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function withDefaults(argv: readonly string[]): string[] {
  const effective = [...argv];

  for (let index = 0; index < DEFAULT_ARGS.length; index += 2) {
    const flag = DEFAULT_ARGS[index];
    const value = DEFAULT_ARGS[index + 1];
    if (!flag || !value) {
      continue;
    }

    if (!hasFlag(effective, flag)) {
      effective.push(flag, value);
    }
  }

  return effective;
}

process.argv = [...process.argv.slice(0, 2), ...withDefaults(process.argv.slice(2))];

void runPhase1Cli("threegorges", "baijiabao-build.ts").catch(reportFatalError);
