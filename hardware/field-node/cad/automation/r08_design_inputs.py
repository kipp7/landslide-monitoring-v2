from __future__ import annotations

from dataclasses import dataclass

from r06_design_inputs import CableSpec


@dataclass(frozen=True)
class PerforatedPlateSpec:
    name: str
    sketch_plane: str
    size_u_mm: float
    size_v_mm: float
    thickness_mm: float
    holes_uvd_mm: tuple[tuple[float, float, float], ...]
    color_rgb: tuple[float, float, float]
    status: str


SECTION_PARTS = (
    PerforatedPlateSpec(
        "FN-SEC-001_enclosure-rear-wall-coupon-300x80x4_2HOLE-NOMINAL_R0.8",
        "Front",
        300.0,
        80.0,
        4.0,
        ((-125.0, 0.0, 6.5), (125.0, 0.0, 6.5)),
        (0.76, 0.80, 0.84),
        "SECTION_COUPON_ONLY_REAR_HOLE_TABLE_PENDING",
    ),
    PerforatedPlateSpec(
        "FN-SEC-002_lower-wall-coupon-280x65x3_4PORT-NOMINAL_R0.8",
        "Front",
        280.0,
        65.0,
        3.0,
        (
            (-118.0, 0.0, 6.5),
            (-82.0, 0.0, 6.5),
            (60.0, 0.0, 16.5),
            (110.0, 0.0, 16.5),
        ),
        (0.76, 0.80, 0.84),
        "SECTION_COUPON_ONLY_VERIFY_PURCHASED_INTERFACES",
    ),
    PerforatedPlateSpec(
        "FN-GNS-006_mast-base-plate-90x80x8_4HOLE-NOMINAL_R0.8",
        "Top",
        90.0,
        80.0,
        8.0,
        (
            (-32.0, -25.0, 8.5),
            (32.0, -25.0, 8.5),
            (-32.0, 25.0, 8.5),
            (32.0, 25.0, 8.5),
        ),
        (0.36, 0.39, 0.42),
        "NOMINAL_CLEARANCE_PATTERN_LOAD_CALC_PENDING",
    ),
)


WALL_DETAIL_CABLES = (
    CableSpec(
        "W7-SEC",
        "FN-HAR-038_W7-rf1-through-wall-detail_R0.8",
        "RF1 coax through bulkhead with internal and external service bend",
        5.0,
        50.0,
        ((-118, -92, 28), (-118, -112, 28), (-118, -128, 28), (-118, -151, 18), (-138, -164, 0)),
        "DETAIL_ROUTE_ACTUAL_OD_CONNECTORS_PENDING",
    ),
    CableSpec(
        "W8-SEC",
        "FN-HAR-039_W8-rf2-through-wall-detail_R0.8",
        "RF2 coax through bulkhead with internal and external service bend",
        5.0,
        50.0,
        ((-82, -92, 28), (-82, -112, 28), (-82, -128, 28), (-82, -151, 18), (-62, -164, 0)),
        "DETAIL_ROUTE_ACTUAL_OD_CONNECTORS_PENDING",
    ),
    CableSpec(
        "W6-SEC",
        "FN-HAR-040_W6-g2-through-wall-drip-detail_R0.8",
        "Soil cable through G2 gland with retained drip bend",
        6.5,
        39.0,
        ((60, -92, 28), (60, -112, 28), (60, -128, 28), (60, -151, 8), (45, -168, -10), (25, -168, -35)),
        "DETAIL_ROUTE_ACTUAL_OD_GLAND_PENDING",
    ),
    CableSpec(
        "W1-SEC",
        "FN-HAR-041_W1-g1-through-wall-drip-detail_R0.8",
        "PV cable through G1 gland with retained drip bend",
        6.0,
        36.0,
        ((110, -92, 28), (110, -112, 28), (110, -128, 28), (110, -151, 8), (126, -168, -10), (146, -168, 0)),
        "DETAIL_ROUTE_ACTUAL_OD_GLAND_PENDING",
    ),
)


DETAIL_ASSEMBLIES = (
    {
        "name": "FN-ASM-007A_enclosure-back-connection-detail_R0.8",
        "title": "ENCLOSURE REAR STRAP / CROSSMEMBER CONNECTION",
        "subtitle": "TRANSPARENT SECTION COUPON - TWO IDENTICAL HEIGHT STATIONS IN MASTER",
        "scale": 0.48,
        "notes": (
            "2 x REAR STRAPS DISTRIBUTE BOX LOAD TO THE COMMON FRAME",
            "M6 ENVELOPES ARE NOMINAL; REAR BOX HOLES AND WALL CAPACITY ARE PENDING",
            "SECTION COUPON IS A REVIEW AID, NOT THE PURCHASED BOX HOLE TABLE",
        ),
    },
    {
        "name": "FN-ASM-007B_solar-clamp-pivot-detail_R0.8",
        "title": "SOLAR PANEL / BACK RAIL / CLAMP / PIVOT CONNECTION",
        "subtitle": "35 DEG PANEL WITH TRANSPARENT ENVELOPE AND SUPPORT CONTEXT",
        "scale": 0.42,
        "notes": (
            "EDGE CLAMPS AVOID INVENTING PANEL FRAME HOLES BEFORE PHYSICAL SURVEY",
            "BACK RAIL NORMAL OFFSET = 18.5 mm FROM PANEL MID-PLANE",
            "CLAMP, PIVOT AND SWM-10W FRAME INTERFACES REMAIN SAMPLE-DEPENDENT",
        ),
    },
    {
        "name": "FN-ASM-007C_gnss-mast-base-brace-detail_R0.8",
        "title": "GNSS CENTRAL MAST / BASE PLATE / BRACE CONNECTION",
        "subtitle": "SYMMETRIC LOAD PATH WITH NOMINAL FOUR-HOLE BASE PLATE",
        "scale": 0.38,
        "notes": (
            "LEFT/RIGHT BRACES LIMIT MAST SWAY AND ANTENNA PHASE-CENTRE MOTION",
            "4 x DIA 8.5 IS A NOMINAL REVIEW PATTERN, NOT A RELEASED DRILL TABLE",
            "BT-M87SF AND BT-760 DATUMS, LOADS AND FASTENER GRADES ARE PENDING",
        ),
    },
    {
        "name": "FN-ASM-007D_through-wall-drip-retention-detail_R0.8",
        "title": "LOWER WALL / BULKHEAD / GLAND / DRIP-LOOP RETENTION",
        "subtitle": "REAL ROUND SWEEPS PASS THROUGH FOUR NOMINAL CUT FEATURES",
        "scale": 0.48,
        "notes": (
            "RF1/RF2 USE BULKHEAD BODIES; G2/G1 USE CABLE GLANDS",
            "CABLES PASS THROUGH OPENINGS AND BEND OUTSIDE THE WALL - NOT INTO SOLID WALL",
            "CUTOUTS, CABLE OD, CONNECTOR LENGTH, BEND RADIUS AND P-CLIPS REQUIRE SAMPLES",
        ),
    },
)
