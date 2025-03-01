// =============================
// CHAIN CONFIGURATION
// =============================
// Edit accordingly for your target chain
export const config = {
  // Network settings
  RPC_ENDPOINT: 'http://localhost:26657',
  CHAIN_ID: 'gaia-1',
  ADDRESS_PREFIX: 'gaia',

  // Token settings
  TOKEN_NAME: 'STAKE',      // Display name / ticker / symbol (e.g. 'ATOM', 'EVMOS')
  TOKEN_DENOM: 'ustake',    // Base denomination with prefix (e.g. 'uatom', 'aevmos')
  GAS_PRICE: '0.025ustake',
  GAS_ADJUSTMENT: 1.3,      // Buffer to avoid tx failure

  // Contract settings
  CONTRACT_LABEL: 'gas_test_contract',
  WASM_PATH: '../artifacts/cw_gas_test.wasm',
  CONTRACT_ADDRESS: '',     // Optional: reuse existing contract [check ./deployments.json]

  // Test configuration
  TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
  OUTPUT_FILE: 'gas_results.csv',
  REQUEST_DELAY: 1000,      // Delay between requests in milliseconds
};