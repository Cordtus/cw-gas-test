// =============================
// CHAIN CONFIGURATION
// =============================
// Edit accordingly for your target chain
export const config = {
  // Network settings
  RPC_ENDPOINT: 'http://localhost:26657',
  REST_ENDPOINT: 'http://localhost:1317',
  CHAIN_ID: 'gaia-1',
  ADDRESS_PREFIX: 'stake',

  // Token settings
  TOKEN_NAME: 'STAKE',      // Display name / ticker / symbol (e.g. 'ATOM', 'EVMOS')
  TOKEN_DENOM: 'ustake',    // Base denomination with prefix (e.g. 'uatom', 'aevmos')
  GAS_PRICE: '0.02ustake',
  GAS_ADJUSTMENT: 1.3,      // Buffer to avoid tx failure

  // Contract settings
  CONTRACT_LABEL: 'gas_test_contract',
  WASM_PATH: '../artifacts/cw_gas_test.wasm',
  CONTRACT_ADDRESS: '',     // Optional: reuse existing contract [check ./deployments.json]

  // Test configuration
  TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
  OUTPUT_FILE: 'gas_results.csv',
  REQUEST_DELAY: 1000,      // Delay between requests in milliseconds
  MAX_PARALLEL_REQUESTS: 3, // Maximum number of parallel requests
  
  // Transaction monitoring
  TX_CONFIRMATION_TIMEOUT: 10000, // Max time to wait for tx confirmation (ms)
  TX_POLLING_INTERVAL: 3000,      // How often to check for tx confirmation (ms)
  
  // Analysis options
  GENERATE_VISUALIZATION: true,   // Whether to generate HTML visualization
  SMALL_MESSAGE_THRESHOLD: 200,   // Threshold for small vs large message analysis
  RETRY_ATTEMPTS: 2,              // Number of retry attempts for failed operations
  
  // Advanced options
  MAX_MESSAGE_SIZE: 10000,        // Maximum message size to test (bytes)
  VERBOSE_LOGGING: true,          // Enable detailed logging
  SAVE_REPORTS_TO: './reports',   // Directory to save analysis reports
};