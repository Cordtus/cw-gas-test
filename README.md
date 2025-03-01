# CW Gas Test

A toolkit for measuring and analyzing gas costs associated with contract execution and data storage on CosmWasm-enabled blockchains.
This repository contains a CosmWasm smart contract and automated testing tools to measure transaction costs for various message sizes and formats.

*I have uploaded the result of my initial test (on babylon-testnet-5, default parameters) in this [analysis report](https://gist.github.com/Cordtus/8753d81f135055e06973894cb3455f05).*

## Project Structure

```sh
cw-gas-test/
├── src/                 # Rust contract code
│   └── lib.rs           # Gas testing contract
├── artifacts/           # Compiled contract (after build)
├── scripts/             # JavaScript automation
│   ├── config.js        # Chain Configuration
│   ├── deploy.js        # Contract deployment
│   ├── test-gas.js      # Gas testing script
│   ├── analyze-results.js # Analysis of results
│   ├── package.json     # JS dependencies
│   └── .env             # Environment variables (create from template)
├── Cargo.toml           # Rust dependencies
├── rust-toolchain.toml  # Rust version spec
└── build.sh             # Compilation script
```

## Setup Instructions

### Prerequisites

- Rust (1.74.0+)
- Node.js (v18.0.0+)
- Yarn
- Docker (for contract optimization)
- Fee tokens for the network being tested

### 1. Prepare the Environment

```bash
# Clone the repository
git clone https://github.com/Cordtus/cw-gas-test.git
cd cw-gas-test

# Make build script executable
chmod +x build.sh
```

### 2. Build the Contract

```bash
# Compile and optimize with Docker
./build.sh
```

This creates an optimized WASM file in the `artifacts/` directory.

### 3. Create Target Chain Configuration

Edit `scripts/config.js` to match your target chain's settings.

Example config:

```js
// Network settings
RPC_ENDPOINT: 'http://localhost:26657',
REST_ENDPOINT: 'http://localhost:1317',
CHAIN_ID: 'gaia-1',
ADDRESS_PREFIX: 'gaia',

// Token settings
TOKEN_NAME: 'STAKE',      // Display name or ticker symbol (e.g. 'ATOM', 'EVMOS')
TOKEN_DENOM: 'ustake',    // Base denomination with prefix (e.g. 'uatom', 'aevmos')
GAS_PRICE: '0.025ustake', // Format: {price}{denom} e.g. '0.025uatom'
```

### 4. Set Up JavaScript Automation

```bash
# Move to scripts directory
cd scripts

# Install dependencies
yarn

# Create .env file
cp .env.template .env
```

Edit `.env` to add your mnemonic:

```sh
MNEMONIC="word1 word2 word3 ... word24"
```

### 5. Deploy and Run Tests

```bash
# Deploy contract
yarn deploy

# Run gas tests
yarn test

# Analyze results
yarn analyze
```

This will create:

- `gas_results.csv` - Raw test data
- `gas_analysis.md` - Analysis summary

## Customizing Tests

Edit `config.js` to adjust test parameters:

```javascript
// test message lengths
TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
```

## Running on Existing Contract

To test with an already deployed contract:

- Open `config.js` and set the `CONTRACT_ADDRESS` field:

```javascript
export const config = {
      // ... other settings ...
      CONTRACT_ADDRESS: 'gaia1...', // Set contract address or leave blank to deploy a new one
};
```

- Run the tests without redeploying:

```bash
yarn test
```

## Adapting for Other Chains

This tool can be easily adapted for other CosmWasm-enabled chains:

- Update `config.js` with target chain RPC endpoints, gas price, address prefix etc.
- Rebuild contract if required by a breaking `wasmd` version update (e.g., changes in `cosmwasm-std` dependencies):
  - Update `Cargo.toml` dependencies to match target chain
  - Recompile with `./build.sh`

*Directory of [CosmWasm enabled networks](https://cosmwasm.com/adoption), courtesy of [Confio](https://confio.gmbh/).
Refer to the [Cosmos Chain Registry](https://github.com/cosmos/chain-registry) for chain parameters and other information.

## Troubleshooting

**Problem**: RPC errors during deployment or testing  
**Solution**: Try alternate RPC endpoint in `config.js`

**Problem**: Out of gas errors  
**Solution**: Increase `GAS_ADJUSTMENT` in `config.js`

**Problem**: Incorrect fee calculation  
**Solution**: Verify `GAS_PRICE` matches the chain's minimum gas price

**Problem**: Permission errors when removing artifacts  
**Solution**: Use `sudo rm -rf artifacts/*` or modify file ownership/permissions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
