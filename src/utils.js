import * as flags from "./flags.js";

/**
 * Get random number.
 * @param {number} min
 * @param {number} max
 * @param {number}
 */
export function getRandomNum(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Decodes the base 64 audio to ArrayBuffer used by Web Audio.
 * @param {string} base64String
 */
export function decodeBase64ToArrayBuffer(base64String) {
  var len = base64String.length / 4 * 3;
  var str = atob(base64String);
  var arrayBuffer = new ArrayBuffer(len);
  var bytes = new Uint8Array(arrayBuffer);

  for (var i = 0; i < len; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Return the current timestamp.
 * @return {number}
 */
export function getTimeStamp() {
  return flags.isIOS ? new Date().getTime() : performance.now();
}
