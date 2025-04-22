// =============================
// CHAIN CONFIGURATION
// =============================
// Edit accordingly for your target chain
export const config = {
  // Network settings
  RPC_ENDPOINT: 'https://rpc-testnet.sei-apis.com',
  REST_ENDPOINT: 'https://rest-testnet.sei-apis.com',
  CHAIN_ID: 'atlantic-2',
  ADDRESS_PREFIX: 'sei',

  // Token settings
  TOKEN_NAME: 'SEI',      // Display name / ticker / symbol (e.g. 'ATOM', 'EVMOS')
  TOKEN_DENOM: 'usei',    // Base denomination with prefix (e.g. 'uatom', 'aevmos')
  GAS_PRICE: '0.02usei',
  GAS_ADJUSTMENT: 1.3,      // Buffer to avoid tx failure

  // Contract settings
  CONTRACT_LABEL: 'gas_test_contract',
  WASM_PATH: '../artifacts/cw_gas_test.wasm',
  CONTRACT_ADDRESS: 'sei1hds6ucyf4n63f0d4gz5tf693ktr6gg7z0k6dlpfaat6l8acsta0ss94ytk',     // Optional: reuse existing contract [check ./deployments.json]

  // Test configuration
  TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
  OUTPUT_FILE: 'gas_results.csv',
  REQUEST_DELAY: 1000,      // Delay between requests in milliseconds
  
  // Transaction monitoring
  TX_CONFIRMATION_TIMEOUT: 10000, // Max time to wait for tx confirmation (ms)
  TX_POLLING_INTERVAL: 3000,      // How often to check for tx confirmation (ms)
};