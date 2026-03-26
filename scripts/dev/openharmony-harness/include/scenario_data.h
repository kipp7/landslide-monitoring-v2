#ifndef OPENHARMONY_HARNESS_SCENARIO_DATA_H
#define OPENHARMONY_HARNESS_SCENARIO_DATA_H

typedef struct {
    const char *name;
    const char *chunks[8];
    int chunk_count;
} HarnessScenario;

extern const HarnessScenario generated_scenarios[];
extern const int generated_scenario_count;

#endif
