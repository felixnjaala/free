fuction import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://localhost:1883');
// Keep the simulator's identity set stable: telemetry values change, IDs do not.
const DEVICE_IDS = Array.from({ length: 20 }, (_, index) => `C${index + 1}`);
const deviceLocations = new Map();
const C1_LOCATION = { lat: -8.94262892, lon: 33.42084295 };
const LOCATION_SPACING = 0.0025;
let nextDeviceIndex = 0;
let telemetryCount = 0;
let nextAnomalyType = 'stale';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomCoordinate(min, max) {
  // Keep the eight decimal places in the JSON payload, including trailing zeroes.
  return (Math.random() * (max - min) + min).toFixed(8);
}

function randomLocation(controllerId) {
  let coordinates = deviceLocations.get(controllerId);

  if (!coordinates) {
    if (controllerId === 'C1') {
      coordinates = {
        lat: C1_LOCATION.lat.toFixed(8),
        lon: C1_LOCATION.lon.toFixed(8)
      };
    } else {
      const controllerIndex = Number(controllerId.slice(1)) - 2;
      const column = (controllerIndex % 5) - 2;
      const rowOffsets = [-2, -1, 1, 2];
      const row = rowOffsets[Math.floor(controllerIndex / 5)];

      // Keep the controllers close to C1 but separated enough for map markers and links.
      coordinates = {
        lat: (C1_LOCATION.lat + (row * LOCATION_SPACING)).toFixed(8),
        lon: (C1_LOCATION.lon + (column * LOCATION_SPACING)).toFixed(8)
      };
    }
    deviceLocations.set(controllerId, coordinates);
  }

  return {
    set: Math.random() > 0.1,
    lat: coordinates.lat,
    lon: coordinates.lon,
    label: `Iyunga-Mbeya-${controllerId}-${randomInt(1, 999)}`
  };
}

function nextTelemetryAnomaly() {
  telemetryCount += 1;

  // Send ten normal records, then one anomalous record.
  if (telemetryCount % 11 !== 0) return null;

  const anomalyType = nextAnomalyType;
  nextAnomalyType = nextAnomalyType === 'stale' ? 'flow mismatch' : 'stale';
  return anomalyType;
}

function createController(controllerId, peerId, role, anomalyType) {
  const flowLpm = randomFloat(0, 250, 2);
  const peerFlowLpm = anomalyType === 'flow mismatch'
    ? Number((flowLpm >= 100
      ? flowLpm - randomFloat(30, 90, 2)
      : flowLpm + randomFloat(30, 90, 2)).toFixed(2))
    : flowLpm;
  const peerAgeMs = anomalyType === 'stale'
    ? randomInt(300000, 1100000)
    : randomInt(100, 299999);
  const isPeerFresh = peerAgeMs < 300000;
  const difference = Number(Math.abs(flowLpm - peerFlowLpm).toFixed(2));
  const hasAnomaly = anomalyType !== null;
  const sensorNumber = randomInt(1, 8);

  return {
    controller_id: controllerId,
    role,
    slot: randomInt(1, 16),
    uptime_sec: randomInt(1, 864000),
    lora_ok: Math.random() > 0.05,
    sync_ok: Math.random() > 0.1,
    packets_sent: randomInt(0, 50000),
    packets_recv: randomInt(0, 50000),
    location: randomLocation(controllerId),
    sensors: [{
      global_id: `${controllerId}-N${sensorNumber}`,
      role,
      flow_lpm: flowLpm,
      pulse_count: randomInt(0, 1000000),
      status: flowLpm === 0 ? 'NO_FLOW' : (Math.random() > 0.03 ? 'OK' : 'FAULT')
    }],
    peer: {
      id: peerId,
      flow_lpm: peerFlowLpm,
      valid: isPeerFresh,
      rssi: randomInt(-120, -25),
      age_ms: peerAgeMs
    },
    all_peers: [{
      id: peerId,
      flow: peerFlowLpm,
      rssi: randomInt(-120, -25),
      age_ms: peerAgeMs
    }],
    anomaly: {
      detected: hasAnomaly,
      diff_lpm: difference,
      message: hasAnomaly ? `Peer ${peerId} data ${anomalyType}` : 'No anomaly detected',
      count: hasAnomaly ? randomInt(1, 100) : 0
    }
  };
}

client.on('connect', () => {
  console.log('✅ IoT 10-record Bulk Simulator connected to Mosquitto');

  setInterval(() => {
    const bulkTelemetry = [];

    // Generate five IN/OUT peer pairs, for ten controller records per message.
    for (let pair = 0; pair < 5; pair += 1) {
      const firstId = DEVICE_IDS[nextDeviceIndex];
      const secondId = DEVICE_IDS[(nextDeviceIndex + 1) % DEVICE_IDS.length];
      nextDeviceIndex = (nextDeviceIndex + 2) % DEVICE_IDS.length;
      const firstRole = Math.random() > 0.5 ? 'OUT' : 'IN';
      const secondRole = firstRole === 'OUT' ? 'IN' : 'OUT';

    //   bulkTelemetry.push(
    //     createController(firstId, secondId, firstRole, nextTelemetryAnomaly()),
    //     createController(secondId, firstId, secondRole, nextTelemetryAnomaly())
    //   );
    // }

    client.publish('devices/bulk/telemetry', JSON.stringify(bulkTelemetry));
    console.log('📡 10 bulk telemetry records sent:', bulkTelemetry);
  }, 20000); // every 20 seconds
});
