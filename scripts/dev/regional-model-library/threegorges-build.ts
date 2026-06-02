import { reportFatalError, runPhase1Cli } from "./phase1-run";

void runPhase1Cli("threegorges", "threegorges-build.ts").catch(reportFatalError);
