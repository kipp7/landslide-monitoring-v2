from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CableSpec:
    wire_id: str
    name: str
    purpose: str
    od_mm: float
    minimum_bend_radius_mm: float
    points_xyz_mm: tuple[tuple[float, float, float], ...]
    status: str


INTERNAL_CABLES = (
    CableSpec("W1", "FN-HAR-017_W1-pv-input-round_R0.6", "PV gland to CN3791 PV input", 5.5, 33.0, ((110,-133,28),(110,-119.5,28),(110,-103,28),(131,-87,24),(131,-20,22),(119,-9,22)), "OD_AND_BEND_RADIUS_NOMINAL"),
    CableSpec("W2", "FN-HAR-018_W2-battery-charge-round_R0.6", "CN3791 battery output to battery", 4.5, 27.0, ((73,-9,23),(73,-19,24),(67,-28,25),(60,-34,28)), "CONNECTOR_PENDING"),
    CableSpec("W3", "FN-HAR-019_W3-battery-to-fuse-round_R0.6", "Battery load to fuse/service disconnect", 5.0, 30.0, ((60,-36,28),(55,-43,26),(52,-52,24),(47,-55,23)), "FUSE_PENDING"),
    CableSpec("W4", "FN-HAR-020_W4-fuse-to-dc5521-round_R0.6", "Fuse/service disconnect to PCB DC5521", 5.0, 30.0, ((9,-55,23),(2,-58,23),(-4,-66,25),(-15.5,-75,27)), "DC5521_PLUG_PENDING"),
    CableSpec("W5", "FN-HAR-021_W5-tilt-rs485-round_R0.6", "Internal tilt RS485 to PCB", 5.2, 31.0, ((23,53,30),(14,56,28),(4,62,26),(-4,69,26),(-15.5,70,28)), "INTERNAL_SHIELDED_CABLE"),
    CableSpec("W6", "FN-HAR-022_W6-soil-rs485-round_R0.6", "Soil gland to PCB RS485-2", 6.0, 36.0, ((60,-133,28),(60,-119.5,28),(60,-101,28),(38,-92,24),(7,-80,23),(2,-5,23),(0,38,25),(-15.5,45,28)), "OD_AND_GLAND_PENDING"),
    CableSpec("W7", "FN-HAR-023_W7-gnss-coax-round_R0.6", "PCB GNSS to RF1 bulkhead", 3.5, 35.0, ((-130.5,-75,27),(-135,-83,26),(-136,-96,26),(-128,-108,28),(-118,-119.5,28),(-118,-133,28)), "50_OHM_COAX_NOMINAL_OD"),
    CableSpec("W8", "FN-HAR-024_W8-xls1-coax-round_R0.6", "PCB XLS1 to RF2 bulkhead", 3.5, 35.0, ((-130.5,0,27),(-137,-12,26),(-137,-80,26),(-126,-103,28),(-82,-119.5,28),(-82,-133,28)), "50_OHM_COAX_NOMINAL_OD"),
)


EXTERNAL_CABLES = (
    CableSpec("W1-EXT", "FN-HAR-025_W1-pv-external-drip-loop_R0.6", "PV panel to G1 with drip loop", 6.0, 36.0, ((110,-142,28),(110,-165,8),(128,-170,-12),(168,-150,5),(168,130,120),(120,165,230),(40,185,285),(0,185,305)), "CONCEPT_ROUTE_OD_PENDING"),
    CableSpec("W6-EXT", "FN-HAR-026_W6-soil-service-tail_R0.6", "G2 soil cable service tail", 6.5, 39.0, ((60,-142,28),(60,-166,5),(45,-174,-20),(15,-170,-40),(15,-170,-110)), "CONCEPT_SERVICE_TAIL"),
    CableSpec("W7-EXT", "FN-HAR-027_W7-gnss-external-drip-loop_R0.6", "RF1 to BT-760 TNC with fixed strain relief", 5.0, 50.0, ((-118,-142,28),(-118,-166,4),(-142,-174,-18),(-172,-148,5),(-172,145,90),(-150,166,360),(-100,166,510),(0,156,620),(0,145,660)), "3M_50_OHM_TNCJ_SMAJ_ROUTE"),
    CableSpec("W8-EXT", "FN-HAR-028_W8-xls1-external_R0.6", "RF2 to separate XLS1 antenna", 5.0, 50.0, ((-82,-142,28),(-82,-165,5),(-60,-174,-15),(170,-165,20),(180,120,250),(195,145,420)), "ANTENNA_INTERFACE_PENDING"),
)
