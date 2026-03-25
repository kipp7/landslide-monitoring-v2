function nowIso() {
  return new Date().toISOString();
}

function skipWhitespace(input, index) {
  let cursor = index;
  while (cursor < input.length && /\s/.test(input[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findJsonValueStart(json, key) {
  const pattern = `"${key}"`;
  const keyIndex = json.indexOf(pattern);
  if (keyIndex === -1) return -1;
  let cursor = keyIndex + pattern.length;
  cursor = skipWhitespace(json, cursor);
  if (json[cursor] !== ":") return -1;
  cursor += 1;
  cursor = skipWhitespace(json, cursor);
  return cursor;
}

function isPlatformCommandPayload(json) {
  const schemaVersionStart = findJsonValueStart(json, "schema_version");
  const commandIdStart = findJsonValueStart(json, "command_id");
  const commandTypeStart = findJsonValueStart(json, "command_type");
  const payloadStart = findJsonValueStart(json, "payload");
  return (
    schemaVersionStart !== -1 &&
    Number.parseInt(json.slice(schemaVersionStart), 10) === 1 &&
    commandIdStart !== -1 &&
    json[commandIdStart] === '"' &&
    commandTypeStart !== -1 &&
    json[commandTypeStart] === '"' &&
    payloadStart !== -1 &&
    json[payloadStart] === "{"
  );
}

function createAssembler() {
  return {
    linkAckReceived: false,
    platformCommandReady: false,
    platformCommandBuffer: "",
    assemblyBuffer: "",
    braceDepth: 0,
    inString: false,
    escape: false,
    droppedFrames: []
  };
}

function resetAssembly(state) {
  state.assemblyBuffer = "";
  state.braceDepth = 0;
  state.inString = false;
  state.escape = false;
}

function finalizeAssembly(state) {
  if (!state.assemblyBuffer) {
    resetAssembly(state);
    return;
  }
  if (isPlatformCommandPayload(state.assemblyBuffer)) {
    state.platformCommandBuffer = state.assemblyBuffer;
    state.platformCommandReady = true;
  } else {
    state.droppedFrames.push(state.assemblyBuffer);
  }
  resetAssembly(state);
}

function appendCommandByte(state, ch) {
  if (!state.assemblyBuffer) {
    if (ch !== "{") return;
    state.assemblyBuffer = "{";
    state.braceDepth = 1;
    return;
  }

  state.assemblyBuffer += ch;

  if (state.escape) {
    state.escape = false;
    return;
  }

  if (ch === "\\" && state.inString) {
    state.escape = true;
    return;
  }

  if (ch === '"') {
    state.inString = !state.inString;
    return;
  }

  if (state.inString) return;

  if (ch === "{") {
    state.braceDepth += 1;
    return;
  }

  if (ch === "}") {
    state.braceDepth -= 1;
    if (state.braceDepth <= 0) {
      finalizeAssembly(state);
    }
  }
}

function processChunk(state, chunk) {
  for (let i = 0; i < chunk.length; i += 1) {
    if (!state.assemblyBuffer) {
      if (chunk.startsWith("ACK", i)) {
        state.linkAckReceived = true;
        i += 2;
        continue;
      }
      if (chunk.startsWith("OK", i)) {
        state.linkAckReceived = true;
        i += 1;
        continue;
      }
    }
    appendCommandByte(state, chunk[i]);
  }
}

function runScenario(name, chunks) {
  const state = createAssembler();
  chunks.forEach((chunk) => processChunk(state, chunk));
  return {
    name,
    chunks,
    linkAckReceived: state.linkAckReceived,
    platformCommandReady: state.platformCommandReady,
    platformCommandBuffer: state.platformCommandBuffer,
    droppedFrames: state.droppedFrames,
    incompleteAssemblyLeftover: state.assemblyBuffer
  };
}

function main() {
  const prettyCommand =
    '{\n' +
    '  "schema_version": 1,\n' +
    '  "command_id": "00000000-0000-4000-8000-000000001111",\n' +
    '  "device_id": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",\n' +
    '  "command_type": "set_sampling_interval",\n' +
    '  "payload": {\n' +
    '    "intervalSeconds": 10,\n' +
    '    "source": "gateway-pretty-json"\n' +
    '  },\n' +
    '  "issued_ts": "2026-03-26T12:00:00Z"\n' +
    '}';

  const scenarios = [
    runScenario("chunked_pretty_json_is_reassembled", [
      prettyCommand.slice(0, 48),
      prettyCommand.slice(48, 138),
      prettyCommand.slice(138)
    ]),
    runScenario("ack_and_chunked_json_can_coexist", [
      "ACK\r\n" + prettyCommand.slice(0, 72),
      prettyCommand.slice(72, 144),
      prettyCommand.slice(144)
    ]),
    runScenario("invalid_json_frame_is_dropped", [
      '{\n  "schema_version": 1,\n  "command_id": "00000000-0000-4000-8000-000000001112",\n  "device_id": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",\n  "command_type": "manual_collect",\n  "payload": []\n}\n'
    ]),
    runScenario("unfinished_fragment_is_not_promoted", [
      prettyCommand.slice(0, 84)
    ])
  ];

  const report = {
    generatedAt: nowIso(),
    conclusion: "hardware-stable-version-xl01-receive-path-can-reassemble-command-json-fragments-in-source",
    scenarios,
    remainingGaps: [
      "prove the same chunked receive behavior on the real UART path",
      "verify command reassembly under larger bursts and interleaved non-command traffic",
      "capture real-board evidence for chunked pretty JSON plus device_id mismatch handling"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
