from __future__ import annotations

from r06_design_inputs import CableSpec


EXTERNAL_CABLES_R07 = (
    CableSpec(
        "W1-EXT",
        "FN-HAR-032_W1-pv-frame-routed_R0.7",
        "PV panel to G1 with drip loop and frame retention",
        6.0,
        36.0,
        (
            (110, -142, 28),
            (110, -165, 5),
            (135, -175, -10),
            (170, -145, 10),
            (165, 80, 80),
            (150, 130, 125),
            (120, 145, 200),
            (120, 150, 245),
            (80, 110, 255),
            (40, 55, 265),
            (0, 90, 302),
        ),
        "CONCEPT_ROUTE_OD_JUNCTION_BOX_PENDING",
    ),
    CableSpec(
        "W6-EXT",
        "FN-HAR-033_W6-soil-strain-relieved_R0.7",
        "G2 soil cable with lower-wall strain relief and service tail",
        6.5,
        39.0,
        (
            (60, -142, 28),
            (60, -160, 8),
            (60, -168, -15),
            (45, -175, -35),
            (15, -175, -55),
            (15, -175, -130),
        ),
        "CONCEPT_SERVICE_TAIL_OD_PENDING",
    ),
    CableSpec(
        "W7-EXT",
        "FN-HAR-034_W7-gnss-frame-routed_R0.7",
        "RF1 to BT-760 along the left rail and central mast",
        5.0,
        50.0,
        (
            (-118, -142, 28),
            (-118, -165, 5),
            (-145, -175, -15),
            (-165, -145, 5),
            (-160, 80, 80),
            (-145, 125, 120),
            (-128, 135, 180),
            (-120, 145, 245),
            (-120, 145, 385),
            (-90, 145, 500),
            (-20, 145, 590),
            (0, 145, 660),
        ),
        "50_OHM_COAX_CONNECTORS_AND_OD_PENDING",
    ),
    CableSpec(
        "W8-EXT",
        "FN-HAR-035_W8-xls1-frame-routed_R0.7",
        "RF2 to XLS1 antenna along the right rail",
        5.0,
        50.0,
        (
            (-82, -142, 28),
            (-82, -165, 5),
            (-55, -175, -15),
            (165, -150, 10),
            (170, 80, 120),
            (150, 130, 170),
            (120, 145, 245),
            (120, 145, 330),
            (195, 145, 420),
        ),
        "XLS1_ANTENNA_INTERFACE_AND_OD_PENDING",
    ),
)


CABLE_CLIP_POINTS = (
    ("W1-C1", "PV_CABLE_CLIP_RAIL", (120, 141, 200), (0.95, 0.55, 0.05)),
    ("W1-C2", "PV_CABLE_CLIP_PANEL", (40, 51, 265), (0.95, 0.55, 0.05)),
    ("W6-C1", "SOIL_CABLE_LOWER_CLIP", (60, -151, 0), (0.05, 0.36, 0.78)),
    ("W7-C1", "GNSS_CABLE_CLIP_LOWER", (-120, 141, 245), (0.88, 0.64, 0.08)),
    ("W7-C2", "GNSS_CABLE_CLIP_UPPER", (-120, 141, 385), (0.88, 0.64, 0.08)),
    ("W7-C3", "GNSS_CABLE_CLIP_MAST", (-20, 141, 590), (0.88, 0.64, 0.08)),
    ("W8-C1", "XLS1_CABLE_CLIP_RAIL", (120, 141, 245), (0.00, 0.62, 0.72)),
    ("W8-C2", "XLS1_CABLE_CLIP_UPPER_RAIL", (120, 141, 330), (0.00, 0.62, 0.72)),
)
