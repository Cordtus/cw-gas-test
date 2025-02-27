export const config = {
  // network config
  RPC_ENDPOINTS: [
      'https://babylon-testnet-rpc.nodes.guru',
      'https://babylon-testnet-rpc.polkachu.com',
      'https://rpc-babylon-testnet.imperator.co'
  ],
  RPC_ENDPOINT: 'https://babylon-testnet-rpc.nodes.guru',
  CHAIN_ID: 'bbn-test-5',

  // gas config
  GAS_PRICE: '0.002ubbn',
  GAS_ADJUSTMENT: 1.3,

  // contract config
  CONTRACT_LABEL: 'gas_test_contract',
  
  // contract path
  WASM_PATH: '../artifacts/babylon_gas_test.wasm',
  
  // Test configuration
  TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
  OUTPUT_FILE: 'gas_results.csv'
};