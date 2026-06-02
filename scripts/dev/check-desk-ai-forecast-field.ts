import { createMockClient } from "../../apps/desk/src/api/mockClient";

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

async function main(): Promise<void> {
  const client = createMockClient({ delayMs: 0, failureRate: 0 });
  const response = await client.aiPredictions.list({ page: 1, pageSize: 1 });
  const prediction = response.list[0];
  if (!prediction) {
    throw new Error("mock ai prediction list is empty");
  }

  const forecast = prediction.forecastInference;
  if (!forecast) {
    throw new Error("forecastInference was not mapped onto AiPrediction");
  }
  const predictedDisplacementMm = assertFiniteNumber(
    forecast.predictedDisplacementMm,
    "forecastInference.predictedDisplacementMm"
  );
  if (forecast.horizonSpec !== "24h") {
    throw new Error(`expected 24h forecast horizon, got ${String(forecast.horizonSpec)}`);
  }
  if (forecast.requiredFeaturesSatisfied !== true) {
    throw new Error("forecastInference.requiredFeaturesSatisfied should be true in mock proof");
  }

  const payloadForecast = prediction.payload.forecastInference;
  if (typeof payloadForecast !== "object" || payloadForecast === null) {
    throw new Error("raw payload.forecastInference is missing");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        predictionId: prediction.predictionId,
        riskModelKey: prediction.modelKey,
        riskScore: prediction.riskScore,
        forecastModelKey: forecast.modelKey,
        horizonSpec: forecast.horizonSpec,
        predictedDisplacementMm,
        requiredFeaturesSatisfied: forecast.requiredFeaturesSatisfied,
        missingFeatureKeys: forecast.missingFeatureKeys
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
