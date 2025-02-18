// Decode uplink function.
//
// Input is an object with the following fields:
// - bytes = Byte array containing the uplink payload, e.g. [255, 230, 255, 0]
// - fPort = Uplink fPort.
// - recvTime = Uplink message timestamp as Date object.
// - variables = Object containing the configured device variables.
//
// Output must be an object with the following fields:
// - data = Object representing the decoded payload.
function decodeUplink(input) {
  let bytes = input.bytes;
  let data = {};

  switch (bytes.length) {
    case 9:
      data = decodeSOSData(bytes);
      break;
    case 22:
      data = decodeGPSData(bytes);
      break;
    case 49:
      data = decodeVitalsData(bytes);
      break;
    default:
      return {
        data: {
          error: 'Invalid payload length',
        },
      };
  }

  return {
    data: data,
  };
}

function decodeSOSData(bytes) {
  return {
    data_type: 'SOS',
    alarm: getAlarmType(bytes[0]),
    device_mac: getDeviceMac(bytes.slice(1, 7)),
  };
}

function decodeGPSData(bytes) {
  var lng_dir = bytes[8] === 0x45 ? 'E' : bytes[8] === 0x57 ? 'W' : 'Unknown';
  var lat_dir = bytes[17] === 0x4e ? 'N' : bytes[17] === 0x53 ? 'S' : 'Unknown';
  var lngDM = parseGPS(bytes.slice(0, 8));
  var latDM = parseGPS(bytes.slice(9, 17));
  var latitude = dmToDecimal(latDM.degrees, latDM.minutes, lat_dir);
  var longitude = dmToDecimal(lngDM.degrees, lngDM.minutes, lng_dir);

  return {
    data_type: 'GPS',
    latitude: latitude,
    longitude: longitude,
  };
}
/**
 * Parse a GPS coordinate from a byte array.
 * The byte array must be in little-endian order.
 * The coordinate is in the format DDMM.MMMMM.
 * @param {Uint8Array} bytes - The byte array containing the GPS coordinate.
 * @returns {Object} - The parsed GPS coordinate in degrees and decimal minutes.
 */
function parseGPS(bytes) {
  // Convert the format of the double from DDMM.MMMMM to degrees and decimal minutes
  const doubleValue = byteArrayToDouble(bytes);
  const degrees = Math.floor(doubleValue / 100);
  const minutes = doubleValue - degrees * 100;
  return { degrees: degrees, minutes: minutes };
}
/**
 * Convert degrees, decimal minutes to decimal degrees.
 *
 * @param {number} degrees - The degrees part of the coordinate.
 * @param {number} minutes - The minutes part of the coordinate.
 * @param {string} direction - The direction ('N', 'S', 'E', 'W') for the coordinate.
 * @returns {number} - The coordinate in decimal degrees.
 */
function dmToDecimal(degrees, minutes, direction) {
  // Convert to decimal degrees
  let decimalDegrees = degrees + minutes / 60;
  // Adjust for direction
  if (direction === 'S' || direction === 'W') {
    decimalDegrees = -decimalDegrees;
  }
  return decimalDegrees;
}

function decodeVitalsData(bytes) {
  const date = new Date();
  date.setHours(bytes[36], bytes[37], bytes[38], 0);
  return {
    data_type: 'VITALS',
    blood_oxygen: bytes[0],
    wear_status: bytes[1] === 1,
    stress_level: bytes[2],
    rri: byteArrayToInteger(toBigEndian(bytes.slice(3, 5))),
    activity_intensity: bytes[5],
    blood_pressure_sbp: bytes[6],
    blood_pressure_dbp: bytes[7],
    calories: byteArrayToInteger(toBigEndian(bytes.slice(8, 10))),
    surface_temperature: byteArrayToInteger(toBigEndian(bytes.slice(10, 12))) * 0.01,
    steps_today: byteArrayToInteger(toBigEndian(bytes.slice(12, 14))),
    body_temperature: byteArrayToInteger(toBigEndian(bytes.slice(14, 16))) * 0.01,
    heart_rate: bytes[16],
    alarm: getAlarmType(bytes[17]),
    battery: bytes[18],
    lorawan_region: getLorawanRegion(bytes[19]),
    beacon_id1: byteArrayToInteger(toBigEndian(bytes.slice(20, 22))),
    beacon_id1_rssi: bytes[22],
    beacon_id2: byteArrayToInteger(toBigEndian(bytes.slice(23, 25))),
    beacon_id2_rssi: bytes[25],
    beacon_id3: byteArrayToInteger(toBigEndian(bytes.slice(26, 28))),
    beacon_id3_rssi: bytes[28],
    movement_detection: bytes[29] === 1,
    red_key: bytes[30] === 1,
    black_key: bytes[31] === 1,
    mainboard_temperature: bytes[32],
    uv_value: bytes[33],
    fw_version: bytes[34],
    fall_detection: bytes[35] === 1,
    time_calibration: bytes[36] === 1,
    time: date,
    device_mac: getDeviceMac(bytes.slice(41, 47)),
    // stop_mark1: String.fromCharCode(bytes[47]),
    // stop_mark2: String.fromCharCode(bytes[48]),
  };
}

/**
 * Convert a byte array to an integer.
 *
 * @param {Uint8Array} byteArray - The byte array to convert.
 * @returns {number} - The resulting integer.
 */
function byteArrayToInteger(byteArray) {
  if (byteArray.length === 0) {
    throw new Error('Byte array must have at least one element.');
  }

  // Create an ArrayBuffer from the byte array
  const buffer = new ArrayBuffer(byteArray.length);
  const view = new Uint8Array(buffer);
  view.set(byteArray);

  // Create a DataView to interpret the ArrayBuffer as an integer
  const dataView = new DataView(buffer);

  // Depending on the length of the byte array, interpret it as an integer
  let integer;
  switch (byteArray.length) {
    case 1:
      integer = dataView.getUint8(0);
      break;
    case 2:
      integer = dataView.getUint16(0, false); // false for big-endian
      break;
    case 4:
      integer = dataView.getUint32(0, false); // false for big-endian
      break;
    default:
      throw new Error('Byte array length must be 1, 2, or 4 bytes to convert to an integer.');
  }

  return integer;
}
/**
 * Convert a byte array to a double-precision floating-point number.
 *
 * @param {Uint8Array} bytes - The byte array to convert (little-endian order).
 * @returns {number} - The resulting double-precision floating-point number.
 */
function byteArrayToDouble(byteArray) {
  if (byteArray.length === 0) {
    throw new Error('Byte array must have at least one element.');
  }
  // Create an ArrayBuffer and a DataView
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  // Write bytes to the DataView in little-endian order
  byteArray.forEach((byte, i) => {
    view.setUint8(i, byte);
  });

  // Read the double-precision floating-point number from the DataView
  const doubleValue = view.getFloat64(0, true); // true for little-endian
  return doubleValue;
}

function getFirmwareBroadcastMode(code) {
  let scan_mode = code & 0x01 ? 'SCAN' : 'BROADCAST';
  let color_mode = code & 0x02 ? 'GREEN' : 'RED';
  return `${scan_mode}, ${color_mode}`;
}
function getLorawanRegion(code) {
  //00: AS923-1, 10: AS923-2, 20: AS923-3, 01: AU915, 02: EU868, 03: KR920, 04: IN865, 05: US915, 06: RU864
  switch (code) {
    case 0:
      return 'AS923-1';
    case 1:
      return 'AU915';
    case 2:
      return 'EU868';
    case 3:
      return 'KR920';
    case 4:
      return 'IN865';
    case 5:
      return 'US915';
    case 6:
      return 'RU864';
    default:
      return 'N/A';
  }
}

/**
 * Convert a byte array to big-endian format.
 *
 * @param {Uint8Array} byteArray - The byte array to convert.
 * @returns {Uint8Array} - The resulting byte array in big-endian format.
 */
function toBigEndian(byteArray) {
  // Create a new Uint8Array to hold the reversed bytes
  const reversedArray = new Uint8Array(byteArray.length);

  // Reverse the byte order
  for (let i = 0; i < byteArray.length; i++) {
    reversedArray[i] = byteArray[byteArray.length - 1 - i];
  }

  return reversedArray;
}

function getDeviceMac(macBytes) {
  return Array.from(toBigEndian(macBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
}

function getAlarmType(code) {
  switch (code) {
    case 1:
      return 'SOS';
    case 2:
      return 'FIRE';
    case 3:
      return 'SOS';
    default:
      return 'N/A';
  }
}

// Encode downlink function.
//
// Input is an object with the following fields:
// - data = Object representing the payload that must be encoded.
//	 -- data_type = Command {"UPLINK"|"TIME"|"SCAN"|"ALERT"}
//   -- uplink_interval_vitals = Uplink interval in minutes {1|5|10|15|30|60|120}
//   -- uplink_interval_gps = Uplink interval in minutes {1|5|10|15|30|60|120}
//   -- time = Time to set on the device {"YYYY-MM-DD-HH-MM-SS"}
//	 -- scan = Bluetooth scanning enabled {boolean}
//	 -- alert_sound = Alert Sound Enable {boolean}
//	 -- alert_type = Alert Type {0-6}
// - variables = Object containing the configured device variables.
//
// Output must be an object with the following fields:
// - bytes = Byte array containing the downlink payload.

function encodeDownlink(input) {
  const endChar = [13, 10]; // ASCII codes for '\r\n'
  switch (input.data.data_type) {
    case 'UPLINK':
      return {
        bytes: flatten([stringToBytes('UPLINK:'), getUplinkIntervalCode(input.data.uplink_interval_vitals), stringToBytes(','), getUplinkIntervalCode(input.data.uplink_interval_gps), endChar]),
      };

    case 'TIME':
      return {
        bytes: flatten([stringToBytes('TIME:'), stringToBytes(input.data.time), endChar]),
      };
    case 'SCAN':
      return {
        bytes: flatten([stringToBytes('SCAN:'), stringToBytes(input.data.scan), endChar]),
      };
    case 'ALERT':
      return {
        bytes: flatten([stringToBytes('ALERT:'), stringToBytes(input.data.alert_sound ? '1' : '2'), stringToBytes(','), stringToBytes('0'), endChar]),
      };
    default:
      return {
        errors: ['Invalid data type'],
      };
  }
}

/**
 * Convert a string to an array of ASCII codes.
 * @param {string} str - The string to convert.
 * @returns {Array} - The array of ASCII codes.
 */
function stringToBytes(str) {
  const byteArray = [];
  for (let i = 0; i < str.length; i++) {
    byteArray.push(str.charCodeAt(i));
  }
  return byteArray;
}

/**
 * Flatten an array of arrays.
 * @param {Array} arrays - The array of arrays to flatten.
 * @returns {Array} - The flattened array.
 */
function flatten(arrays) {
  const flatArray = [];
  arrays.forEach((item) => {
    if (Array.isArray(item)) {
      flatArray.push(...item);
    } else {
      flatArray.push(item);
    }
  });
  return flatArray;
}

/**
 * Get the code for the uplink interval.
 * @param {number} interval - The uplink interval in minutes.
 * @returns {number} - The code for the uplink interval.
 */
function getUplinkIntervalCode(interval) {
  const intervalMap = {
    1: '7',
    5: '1',
    10: '2',
    15: '3',
    30: '4',
    60: '5',
    120: '6',
  };

  if (intervalMap[interval]) {
    return intervalMap[interval].charCodeAt(0);
  } else {
    throw new Error('Invalid uplink interval.');
  }
}
