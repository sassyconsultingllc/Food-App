// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
/**
 * image-size 1.x call shape on top of image-size 2.0.3.
 *
 * image-size <= 2.0.2 can hang on crafted JXL, HEIF or ICNS files
 * (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr). Metro 0.83 depends on ^1 and,
 * in src/Assets.js, calls the default export synchronously with either a
 * Buffer or a file path. 2.x only accepts a Uint8Array, so this adapter reads
 * paths itself and hands every call to the real 2.0.3 (installed under the
 * alias `image-size-v2`).
 */
'use strict';

const fs = require('fs');
const v2 = require('image-size-v2');

function toBuffer(input) {
  return typeof input === 'string' ? fs.readFileSync(input) : input;
}

function imageSize(input, callback) {
  if (typeof callback === 'function') {
    // 1.x callback form: async read, result or error via the callback.
    const read = typeof input === 'string' ? fs.promises.readFile(input) : Promise.resolve(input);
    read.then(
      (buffer) => {
        let result;
        try {
          result = v2.imageSize(buffer);
        } catch (error) {
          callback(error);
          return;
        }
        callback(null, result);
      },
      (error) => callback(error)
    );
    return undefined;
  }
  return v2.imageSize(toBuffer(input));
}

module.exports = imageSize;
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
module.exports.types = v2.types;
module.exports.disableTypes = v2.disableTypes;
// 1.x knobs with no 2.x equivalent; kept so callers don't crash.
module.exports.disableFS = function disableFS() {};
module.exports.setConcurrency = function setConcurrency() {};
