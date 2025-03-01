# CosmWasm Gas Test

A toolkit for measuring and analyzing gas costs for CosmWasm contract data storage. This repository contains a CosmWasm smart contract and automated testing tools to measure transaction costs for various message sizes and formats.

For a detailed analysis of initial findings produced by this test on `babylong-testnet-5`, (with default parameters) see this [quick analysist](https://gist.github.com/Cordtus/8753d81f135055e06973894cb3455f05).

## Key Findings

Storage costs as tested follow a linear model:

- Base cost: ~124,174 gas units (~0.000248 BBN)
- Marginal cost: ~40.34 gas units per byte (~0.00000008 BBN)
- Perfect linearity (R² = 1.0000)

## Project Structure

```sh
cw-gas-test/
├── src/                 # Rust contract code
│   └── lib.rs           # Gas testing contract
├── artifacts/           # Compiled contract (after build)
├── scripts/             # JavaScript automation
│   ├── config.js        # Configuration
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

### 3. Set Up JavaScript Automation

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

### 4. Deploy and Test

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
// Change test message lengths
TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],

// Modify RPC endpoint
RPC_ENDPOINT: 'http://localhost:26657',

// Change gas price
GAS_PRICE: '0.002ustake',
```

## Running on Existing Contract

To test with an already deployed contract:

```bash
# Add to .env
CONTRACT_ADDRESS=wallet1...

# Run tests without redeployment
yarn test
```

## Adapting for Other Chains

This toolkit can be adapted for any CosmWasm-enabled chain:

1. Update `config.js` with the chain's RPC endpoints and gas price

2. Modify `deploy.js` if needed to adjust for different chain parameters:

   ```javascript
   const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
      prefix: 'chain-prefix', // Change to target chain's prefix
   });
   ```

3. Rebuild contract if chain requires specific CosmWasm version:
   - Update `Cargo.toml` dependencies to match target chain
   - Recompile with `./build.sh`

## Troubleshooting

**Problem**: RPC errors during deployment or testing
**Solution**: Try alternate RPC endpoint in `config.js`

**Problem**: Out of gas errors
**Solution**: Increase `GAS_ADJUSTMENT` in `config.js`

**Problem**: Incorrect fee calculation
**Solution**: Verify `GAS_PRICE` matches the chain's minimum gas price

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
e