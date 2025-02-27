# Babylon Gas Testing Project

This project measures the gas costs of storing different message sizes and formats on the Babylon blockchain. It helps determine the cost-efficiency of various data storage patterns.

## Project Structure

```sh
babylon-gas-test/
├── src/                 # Rust contract code
│   └── lib.rs           # Gas testing contract
├── artifacts/           # Compiled contract (after build)
├── scripts/             # JavaScript automation
│   ├── config.js        # Configuration
│   ├── deploy.js        # Contract deployment
│   ├── test-gas.js      # Gas testing script
│   ├── analyze-results.js # Analysis of results
│   ├── package.json     # JS dependencies
│   └── .env             # Environment variables
├── Cargo.toml           # Rust dependencies
├── rust-toolchain.toml  # Rust version spec
├── build.sh             # Compilation script
└── gas_results.csv      # Test results (generated)
```

## Setup Instructions

### 1. Prepare the Rust contract

```bash
# Clone the repository
git clone https://github.com/yourusername/babylon-gas-test.git
cd babylon-gas-test

# Build the contract with Docker (recommended)
chmod +x build.sh
./build.sh
```

This will create the optimized WASM file in the `artifacts/` directory.

### 2. Set up JavaScript automation

```bash
# Navigate to the scripts directory
cd scripts

# Install dependencies
npm install

# Create .env file with your mnemonic
cp .env.template .env
# Edit .env with your wallet mnemonic
```

## Running Gas Tests

You can run the entire test suite with a single command:

```bash
npm run test
```

This will:

1. Deploy the contract to Babylon testnet (unless CONTRACT_ADDRESS is provided in .env)
2. Test single character storage costs (letters, numbers, Unicode characters)
3. Test various message lengths (from 1 to 2000 bytes)
4. Test different data formats (JSON, Base64, Hex)
5. Save results to gas_results.csv

## Analyzing Results

After running the tests, analyze the results with:

```bash
npm run analyze
```

This provides:

- Base gas cost (fixed overhead)
- Marginal cost per byte
- Cost predictions for different message sizes
- Comparison of data formats

## Custom Configuration

You can customize the testing parameters in `config.js`:

```javascript
// Edit test message lengths
TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],

// Change output file
OUTPUT_FILE: 'gas_results.csv'
```

## Using an Existing Contract

If you've already deployed the contract and want to run more tests:

```bash
# Add the contract address to .env
echo "CONTRACT_ADDRESS=bbn1..." >> .env

# Run tests on the existing contract
npm run test
```

## Notes on Gas Costs

After analyzing the results, you'll have concrete data to:

1. Predict costs for specific data sizes
2. Optimize your storage patterns
3. Choose the most efficient data formats
4. Make informed decisions about on-chain vs. off-chain storage

The analysis will show you the linear relationship between data size and gas cost, allowing you to calculate:

```sh
Total Gas = Base Gas + (Marginal Gas per Byte × Message Size)
Total Cost = Total Gas × Gas Price
```
