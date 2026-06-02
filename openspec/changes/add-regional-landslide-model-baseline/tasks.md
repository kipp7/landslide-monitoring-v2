## 1. Implementation

- [x] 1.1 Define the baseline model artifact format for regional displacement prediction and warning scoring
- [x] 1.2 Add offline training entry points that can read structured samples and emit versioned model artifacts
- [x] 1.3 Add feature engineering and region selection logic inside `services/ai-prediction-worker`
- [x] 1.4 Replace the default heuristic-only runtime path with `trained model -> fallback heuristic`
- [x] 1.5 Extend emitted `payload` so prediction records keep forecast features, warning factors, model metadata, and fallback state
- [x] 1.6 Document environment variables, artifact loading rules, and operator usage
- [x] 1.7 Verify the worker builds successfully and record the change in the monthly journal

## 2. Follow-up

- [x] 2.1 Add real two-stage baseline output with explicit stage-1 and stage-2 evidence in payload
- [x] 2.2 Replace smoke-only artifacts with first-wave real regional artifacts from landed China datasets
- [x] 2.3 Replace first-hit matcher with candidate-set routing and replay-rerank hook trace
