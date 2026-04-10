/**
 * JavaScript Obfuscation Configuration
 * 
 * Settings for javascript-obfuscator to protect source code.
 * Different profiles for development vs production.
 */

module.exports = {
  // ============================================================================
  // Production Profile (Maximum Protection)
  // ============================================================================
  production: {
    // Compact output (no formatting)
    compact: true,
    
    // Control flow flattening (makes code hard to follow)
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    
    // Dead code injection (adds fake code paths)
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    
    // Debug protection (prevents debugging)
    debugProtection: true,
    debugProtectionInterval: 2000,
    
    // Disable console output
    disableConsoleOutput: true,
    
    // Domain lock (optional - restrict to specific domains)
    // domainLock: ['yourdomain.com', 'app.yourdomain.com'],
    // domainLockRedirectUrl: 'https://yourdomain.com/unauthorized',
    
    // Identifier mangling
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: 'ff_',
    renameGlobals: false, // Be careful with this
    renameProperties: false, // Can break code if not careful
    renamePropertiesMode: 'safe',
    
    // Self-defending (code that detects tampering)
    selfDefending: true,
    
    // Split strings into chunks
    splitStrings: true,
    splitStringsChunkLength: 5,
    
    // String array encoding
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64', 'rc4'],
    stringArrayIndexesType: ['hexadecimal-number', 'hexadecimal-numeric-string'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    
    // Transform object keys
    transformObjectKeys: true,
    
    // Unicode escape sequences
    unicodeEscapeSequence: true,
    
    // Numbers to expressions
    numbersToExpressions: true,
    
    // Simplify (optimize)
    simplify: true,
    
    // Source map (disable for production)
    sourceMap: false,
    
    // Target environment
    target: 'browser',
    
    // Reserved names (don't obfuscate these)
    reservedNames: [
      '^React',
      '^Component',
      '^useState',
      '^useEffect',
      '^expo',
      '^navigation',
    ],
    
    // Reserved strings (don't encode these)
    reservedStrings: [
      'localhost',
      'api',
      'license',
    ],
  },
  
  // ============================================================================
  // Development Profile (Lighter protection for testing)
  // ============================================================================
  development: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.5,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    sourceMap: true,
    target: 'browser',
  },
  
  // ============================================================================
  // Server Profile (For Node.js server code)
  // ============================================================================
  server: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false, // Don't break server debugging
    disableConsoleOutput: false, // Keep server logs
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: 'srv_',
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
    sourceMap: false,
    target: 'node',
    reservedNames: [
      '^express',
      '^router',
      '^trpc',
      '^drizzle',
    ],
  },
};
