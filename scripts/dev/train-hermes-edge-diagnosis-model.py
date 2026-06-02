from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = REPO_ROOT / "services" / "hermes-edge-supervisor" / "models"
REPORT_PATH = REPO_ROOT / "docs" / "unified" / "reports" / "hermes-edge-diagnosis-model-training-latest.json"

FEATURE_KEYS = [
    "serialOpen",
    "mqttConnected",
    "portOnline",
    "portConfigured",
    "networkStaConnected",
    "networkEthernetUplink",
    "networkApFallback",
    "summaryAccepted",
    "summaryScore",
    "summaryOverallLevelRank",
    "gatewaySourceExists",
    "networkSourceExists",
    "gatewaySourceErrorPresent",
    "networkSourceErrorPresent",
    "gatewaySourceStale",
    "networkSourceStale",
    "lastPublishedMissing",
    "lastPublishedAgeSeconds",
    "lastPublishedFreshnessBreach",
    "lastSerialReadMissing",
    "lastSerialReadAgeSeconds",
    "serialOpenButNoRead",
    "mqttConnectedButNoPublish",
    "spoolPending",
    "publishFailures",
    "schemaRejected",
    "rejectedWriteFailures",
    "rejectedMessages",
    "interleavingSuspected",
    "interleavingWithMultipleSchemas",
    "interleavingWithMultipleDeviceIds",
    "nodeConfiguredCount",
    "nodeOfflineCount",
    "nodeOnlineCount",
    "nodeHealthyRatio",
    "nodeTelemetryMessagesTotal",
    "nodeCommandForwardsTotal",
    "nodeAckPublishesTotal",
    "nodeLastTelemetryMissingCount",
    "nodeMaxLastTelemetryAgeSeconds",
    "nodeLastAckMissingCount",
    "nodeMaxLastAckAgeSeconds",
    "gatewaySourceAgeSeconds",
    "networkSourceAgeSeconds",
    "networkLastErrorPresent",
    "criticalTaskCount",
    "attentionTaskCount",
    "degradedTaskCount",
    "blockedTaskCount",
    "recommendedTaskCount",
    "clearTaskCount",
    "safeAutomatableCount",
    "readOnlyTaskCount",
    "operatorRequiredTaskCount",
    "taskPressureScore",
    "cpuLoad1",
    "cpuLoadPerCore",
    "memAvailableRatio",
    "diskFreeRatio",
    "maxTemperatureC",
    "resourcePressure",
    "hasEnetunreach",
    "hasEconnrefused",
    "hasTimeout",
]

CLASS_LABELS = [
    "healthy_watch",
    "center_mqtt_route_unreachable",
    "center_mqtt_service_unavailable",
    "southbound_serial_or_gateway_gap",
    "field_nodes_not_reporting",
    "shared_port_noise",
    "ap_fallback_backhaul_degraded",
    "publish_backlog_pressure",
    "edge_resource_pressure",
]


@dataclass
class ScenarioTemplate:
    label: str
    count: int
    base: dict[str, float]
    jitter: dict[str, tuple[float, float]]


def clamp(value: float, low: float, high: float) -> float:
    return float(min(high, max(low, value)))


def sample_value(rng: np.random.Generator, key: str, base: dict[str, float], jitter: dict[str, tuple[float, float]]) -> float:
    value = base.get(key, 0.0)
    if key in jitter:
      low, high = jitter[key]
      value = float(rng.uniform(low, high))
    else:
      value = float(value + rng.normal(0, 0.01))

    if key in {
        "serialOpen",
        "mqttConnected",
        "portOnline",
        "portConfigured",
        "networkStaConnected",
        "networkEthernetUplink",
        "networkApFallback",
        "summaryAccepted",
        "gatewaySourceExists",
        "networkSourceExists",
        "gatewaySourceErrorPresent",
        "networkSourceErrorPresent",
        "gatewaySourceStale",
        "networkSourceStale",
        "lastPublishedMissing",
        "lastPublishedFreshnessBreach",
        "lastSerialReadMissing",
        "serialOpenButNoRead",
        "mqttConnectedButNoPublish",
        "networkLastErrorPresent",
        "resourcePressure",
        "hasEnetunreach",
        "hasEconnrefused",
        "hasTimeout",
    }:
        return clamp(value, 0.0, 1.0)

    if key in {"memAvailableRatio", "diskFreeRatio"}:
        return clamp(value, 0.0, 1.0)

    return max(0.0, float(value))


def make_row(rng: np.random.Generator, template: ScenarioTemplate) -> list[float]:
    return [sample_value(rng, key, template.base, template.jitter) for key in FEATURE_KEYS]


def templates() -> list[ScenarioTemplate]:
    common_resource = {
        "summaryAccepted": 1,
        "summaryScore": 82,
        "summaryOverallLevelRank": 1,
        "gatewaySourceExists": 1,
        "networkSourceExists": 1,
        "gatewaySourceErrorPresent": 0,
        "networkSourceErrorPresent": 0,
        "gatewaySourceStale": 0,
        "networkSourceStale": 0,
        "cpuLoad1": 0.6,
        "cpuLoadPerCore": 0.15,
        "memAvailableRatio": 0.65,
        "diskFreeRatio": 0.75,
        "maxTemperatureC": 42,
        "resourcePressure": 0,
    }
    return [
        ScenarioTemplate(
            "healthy_watch",
            260,
            {
                **common_resource,
                "serialOpen": 1,
                "mqttConnected": 1,
                "portOnline": 1,
                "networkStaConnected": 1,
                "summaryScore": 96,
                "summaryOverallLevelRank": 0,
                "nodeOnlineCount": 3,
                "nodeHealthyRatio": 1,
                "nodeTelemetryMessagesTotal": 500,
                "nodeAckPublishesTotal": 20,
                "clearTaskCount": 1,
                "safeAutomatableCount": 0,
            },
            {
                "lastPublishedAgeSeconds": (0, 25),
                "lastSerialReadAgeSeconds": (0, 20),
                "gatewaySourceAgeSeconds": (0, 20),
                "networkSourceAgeSeconds": (0, 40),
                "rejectedMessages": (0, 2),
                "cpuLoad1": (0.1, 1.4),
                "memAvailableRatio": (0.45, 0.85),
                "diskFreeRatio": (0.45, 0.9),
                "maxTemperatureC": (32, 58),
            },
        ),
        ScenarioTemplate(
            "center_mqtt_route_unreachable",
            360,
            {
                **common_resource,
                "serialOpen": 1,
                "mqttConnected": 1,
                "portConfigured": 1,
                "networkEthernetUplink": 1,
                "lastPublishedMissing": 1,
                "lastPublishedFreshnessBreach": 1,
                "lastSerialReadMissing": 1,
                "serialOpenButNoRead": 1,
                "mqttConnectedButNoPublish": 1,
                "summaryScore": 0,
                "summaryOverallLevelRank": 3,
                "nodeConfiguredCount": 3,
                "nodeLastTelemetryMissingCount": 3,
                "nodeLastAckMissingCount": 3,
                "networkLastErrorPresent": 1,
                "criticalTaskCount": 6,
                "blockedTaskCount": 1,
                "recommendedTaskCount": 5,
                "operatorRequiredTaskCount": 6,
                "taskPressureScore": 25,
                "hasEnetunreach": 1,
            },
            {
                "lastPublishedAgeSeconds": (0, 30),
                "spoolPending": (0, 3),
                "nodeCommandForwardsTotal": (10, 500),
                "gatewaySourceAgeSeconds": (0, 20),
                "networkSourceAgeSeconds": (0, 60),
                "cpuLoad1": (0.1, 1.8),
                "maxTemperatureC": (34, 62),
            },
        ),
        ScenarioTemplate(
            "center_mqtt_service_unavailable",
            260,
            {
                **common_resource,
                "serialOpen": 1,
                "portOnline": 1,
                "networkStaConnected": 1,
                "lastPublishedMissing": 1,
                "lastPublishedFreshnessBreach": 1,
                "mqttConnectedButNoPublish": 0,
                "summaryScore": 35,
                "summaryOverallLevelRank": 3,
                "nodeOnlineCount": 3,
                "nodeHealthyRatio": 1,
                "nodeTelemetryMessagesTotal": 400,
                "networkLastErrorPresent": 1,
                "criticalTaskCount": 4,
                "recommendedTaskCount": 3,
                "operatorRequiredTaskCount": 3,
                "taskPressureScore": 15,
                "hasEconnrefused": 1,
            },
            {
                "lastPublishedAgeSeconds": (60, 600),
                "spoolPending": (1, 18),
                "publishFailures": (1, 25),
                "gatewaySourceAgeSeconds": (0, 30),
                "networkSourceAgeSeconds": (0, 60),
            },
        ),
        ScenarioTemplate(
            "southbound_serial_or_gateway_gap",
            260,
            {
                **common_resource,
                "mqttConnected": 1,
                "portConfigured": 1,
                "networkStaConnected": 1,
                "lastPublishedMissing": 1,
                "lastPublishedFreshnessBreach": 1,
                "lastSerialReadMissing": 1,
                "serialOpenButNoRead": 0,
                "mqttConnectedButNoPublish": 1,
                "summaryScore": 20,
                "summaryOverallLevelRank": 3,
                "nodeConfiguredCount": 3,
                "nodeLastTelemetryMissingCount": 3,
                "nodeLastAckMissingCount": 3,
                "criticalTaskCount": 5,
                "blockedTaskCount": 1,
                "recommendedTaskCount": 3,
                "operatorRequiredTaskCount": 4,
                "taskPressureScore": 20,
            },
            {
                "lastPublishedAgeSeconds": (90, 900),
                "lastSerialReadAgeSeconds": (90, 900),
                "rejectedWriteFailures": (0, 4),
                "gatewaySourceAgeSeconds": (0, 120),
            },
        ),
        ScenarioTemplate(
            "field_nodes_not_reporting",
            260,
            {
                **common_resource,
                "serialOpen": 1,
                "mqttConnected": 1,
                "portConfigured": 1,
                "networkEthernetUplink": 1,
                "lastPublishedMissing": 1,
                "lastPublishedFreshnessBreach": 1,
                "summaryScore": 30,
                "summaryOverallLevelRank": 3,
                "nodeConfiguredCount": 3,
                "nodeLastTelemetryMissingCount": 3,
                "nodeLastAckMissingCount": 3,
                "criticalTaskCount": 4,
                "recommendedTaskCount": 3,
                "operatorRequiredTaskCount": 3,
                "taskPressureScore": 15,
            },
            {
                "lastPublishedAgeSeconds": (60, 700),
                "lastSerialReadAgeSeconds": (20, 500),
                "nodeCommandForwardsTotal": (0, 80),
            },
        ),
        ScenarioTemplate(
            "shared_port_noise",
            260,
            {
                **common_resource,
                "serialOpen": 1,
                "mqttConnected": 1,
                "portOnline": 1,
                "networkStaConnected": 1,
                "summaryScore": 70,
                "summaryOverallLevelRank": 1,
                "nodeOnlineCount": 3,
                "nodeHealthyRatio": 1,
                "nodeTelemetryMessagesTotal": 300,
                "criticalTaskCount": 1,
                "recommendedTaskCount": 2,
                "readOnlyTaskCount": 2,
                "taskPressureScore": 5,
            },
            {
                "lastPublishedAgeSeconds": (0, 80),
                "lastSerialReadAgeSeconds": (0, 40),
                "rejectedWriteFailures": (0, 3),
                "rejectedMessages": (5, 45),
                "interleavingSuspected": (1, 15),
                "spoolPending": (0, 5),
            },
        ),
        ScenarioTemplate(
            "ap_fallback_backhaul_degraded",
            240,
            {
                **common_resource,
                "serialOpen": 1,
                "networkApFallback": 1,
                "lastPublishedMissing": 1,
                "lastPublishedFreshnessBreach": 1,
                "networkLastErrorPresent": 1,
                "summaryScore": 45,
                "summaryOverallLevelRank": 2,
                "networkSourceStale": 1,
                "criticalTaskCount": 3,
                "recommendedTaskCount": 2,
                "operatorRequiredTaskCount": 2,
                "taskPressureScore": 11,
                "hasTimeout": 1,
            },
            {
                "mqttConnected": (0, 1),
                "portOnline": (0, 1),
                "lastPublishedAgeSeconds": (20, 500),
                "spoolPending": (0, 8),
                "nodeConfiguredCount": (0, 3),
                "nodeOnlineCount": (0, 2),
            },
        ),
        ScenarioTemplate(
            "publish_backlog_pressure",
            240,
            {
                **common_resource,
                "serialOpen": 1,
                "mqttConnected": 1,
                "portOnline": 1,
                "networkStaConnected": 1,
                "summaryScore": 65,
                "summaryOverallLevelRank": 1,
                "nodeOnlineCount": 3,
                "nodeHealthyRatio": 1,
                "nodeTelemetryMessagesTotal": 600,
                "criticalTaskCount": 2,
                "recommendedTaskCount": 1,
                "operatorRequiredTaskCount": 1,
                "taskPressureScore": 7,
            },
            {
                "lastPublishedAgeSeconds": (40, 300),
                "lastSerialReadAgeSeconds": (0, 20),
                "spoolPending": (6, 80),
                "publishFailures": (0, 10),
            },
        ),
        ScenarioTemplate(
            "edge_resource_pressure",
            220,
            {
                "serialOpen": 1,
                "mqttConnected": 1,
                "portOnline": 1,
                "networkStaConnected": 1,
                "summaryScore": 60,
                "summaryOverallLevelRank": 1,
                "nodeOnlineCount": 3,
                "nodeHealthyRatio": 1,
                "nodeTelemetryMessagesTotal": 400,
                "criticalTaskCount": 1,
                "recommendedTaskCount": 1,
                "operatorRequiredTaskCount": 1,
                "taskPressureScore": 4,
                "resourcePressure": 1,
            },
            {
                "lastPublishedAgeSeconds": (0, 80),
                "lastSerialReadAgeSeconds": (0, 30),
                "spoolPending": (0, 8),
                "cpuLoad1": (3.0, 8.0),
                "memAvailableRatio": (0.03, 0.18),
                "diskFreeRatio": (0.04, 0.2),
                "maxTemperatureC": (72, 92),
            },
        ),
    ]


def generate_dataset(seed: int = 3568) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    rows: list[list[float]] = []
    labels: list[int] = []
    for template in templates():
        for _ in range(template.count):
            rows.append(make_row(rng, template))
            labels.append(CLASS_LABELS.index(template.label))

    indices = np.arange(len(rows))
    rng.shuffle(indices)
    x = np.array(rows, dtype=np.float32)[indices]
    y = np.array(labels, dtype=np.int64)[indices]
    return x, y


def tree_to_dict(tree: Any) -> dict[str, Any]:
    return {
        "childrenLeft": tree.children_left.tolist(),
        "childrenRight": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": tree.threshold.tolist(),
        "value": tree.value.squeeze(axis=1).tolist(),
    }


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    x, y = generate_dataset()
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=3568, stratify=y)
    model = RandomForestClassifier(
        n_estimators=128,
        max_depth=12,
        min_samples_leaf=2,
        random_state=3568,
        class_weight="balanced_subsample",
    )
    model.fit(x_train, y_train)
    pred = model.predict(x_test)
    proba = model.predict_proba(x_test)
    accuracy = float(accuracy_score(y_test, pred))

    artifact = {
        "schemaVersion": "hermes-edge-diagnosis-random-forest.v1",
        "modelKey": "hermes-edge-diagnosis-rf",
        "modelVersion": "2026-05-06",
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "modelType": "random_forest_classifier",
        "featureKeys": FEATURE_KEYS,
        "classLabels": CLASS_LABELS,
        "trainingSummary": {
            "sampleCount": int(len(x)),
            "trainSampleCount": int(len(x_train)),
            "testSampleCount": int(len(x_test)),
            "accuracy": accuracy,
            "meanMaxProbability": float(np.mean(np.max(proba, axis=1))),
        },
        "forest": {
            "nEstimators": len(model.estimators_),
            "nClasses": len(CLASS_LABELS),
            "trees": [tree_to_dict(estimator.tree_) for estimator in model.estimators_],
        },
        "notes": [
            "Trained lightweight supervised model for RK3568 Hermes edge link diagnosis.",
            "Feature set covers link, network, node, parser, task queue, and local resource signals.",
            "The TypeScript sidecar performs local inference from serialized RandomForest parameters.",
        ],
    }

    artifact_path = MODEL_DIR / "edge-diagnosis-rf-v1.json"
    artifact_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    joblib.dump(model, MODEL_DIR / "edge-diagnosis-rf-v1.joblib")

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "accepted": accuracy >= 0.9,
        "mode": "hermes-edge-diagnosis-model-training",
        "currentBoundary": "hermes-edge-diagnosis-model-ready" if accuracy >= 0.9 else "hermes-edge-diagnosis-model-needs-review",
        "artifactPath": str(artifact_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "featureKeys": FEATURE_KEYS,
        "classLabels": CLASS_LABELS,
        "metrics": {
            "accuracy": accuracy,
            "confusionMatrix": confusion_matrix(y_test, pred).tolist(),
            "classificationReport": classification_report(y_test, pred, target_names=CLASS_LABELS, output_dict=True),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
