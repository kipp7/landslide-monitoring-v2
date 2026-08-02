const assert = require("node:assert/strict");
const test = require("node:test");

const { buildNtripGga } = require("../dist/ntrip-gga.js");

test("NTRIP GGA uses node coordinates and emits a checksum-valid CRLF sentence", () => {
  const sentence = buildNtripGga({
    rtk_latitude_deg: 24.612345678,
    rtk_longitude_deg: 118.123456789,
    rtk_gga_quality: 4,
    rtk_satellites_used: 31,
    rtk_hdop: 0.52,
    rtk_altitude_msl_m: 12.345,
    rtk_geoid_separation_m: -2.345
  }, new Date("2026-08-03T08:09:10Z"));

  assert.match(sentence, /^\$GNGGA,080910\.00,2436\.7407407,N,11807\.4074073,E,4,31,0\.52,12\.345,M,-2\.345,M,,\*[0-9A-F]{2}\r\n$/u);
  const [bodyWithDollar, expectedWithCrlf] = sentence.split("*");
  let checksum = 0;
  for (const byte of Buffer.from(bodyWithDollar.slice(1), "ascii")) checksum ^= byte;
  assert.equal(expectedWithCrlf, `${checksum.toString(16).toUpperCase().padStart(2, "0")}\r\n`);
});

test("NTRIP GGA refuses missing or out-of-range positions", () => {
  assert.equal(buildNtripGga({}, new Date()), null);
  assert.throws(
    () => buildNtripGga({ rtk_latitude_deg: 91, rtk_longitude_deg: 118 }, new Date()),
    /out of range/u
  );
});
