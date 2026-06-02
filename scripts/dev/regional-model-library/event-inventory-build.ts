import { reportFatalError, runPhase1Cli } from "./phase1-run";

void runPhase1Cli("event-inventory", "event-inventory-build.ts").catch(reportFatalError);
