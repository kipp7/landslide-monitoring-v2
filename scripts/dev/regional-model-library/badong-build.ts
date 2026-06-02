import { reportFatalError, runPhase1Cli } from "./phase1-run";

void runPhase1Cli("badong", "badong-build.ts").catch(reportFatalError);
