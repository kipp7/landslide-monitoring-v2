import { reportFatalError, runPhase1Cli } from "./phase1-run";

void runPhase1Cli("region-profile", "region-profile-build.ts").catch(reportFatalError);
