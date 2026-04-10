class DOMExceptionShim extends Error {
  constructor(message = '', name = 'DOMException') {
    super(message);
    this.name = name;
    if (Error.captureStackTrace) Error.captureStackTrace(this, DOMExceptionShim);
  }
}

// CommonJS export for consumers using require()
module.exports = DOMExceptionShim;
module.exports.DOMException = DOMExceptionShim;
module.exports.default = DOMExceptionShim;

// Named export for ESM imports (node >=14+ when using interop)
try {
  Object.defineProperty(exports, 'DOMException', {
    enumerable: true,
    get() { return DOMExceptionShim }
  });
} catch (e) {
  // ignore in environments where exports is not writable
}
