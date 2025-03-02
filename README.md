# CW Gas Test

A toolkit for measuring and analyzing gas costs associated with contract execution and data storage on CosmWasm-enabled blockchains.  
This repository contains a complete working CosmWasm smart contract, along with scripts for automated deployment and testing.

It is a working and tested demonstration of a moderate to complex CosmWasm contract project that serves a unique and overall not very practical purpose, with a heavy focus on hitting as many development processes as possible, and clearly documenting the overall process.

The tool itself provides a rough but realistic idea of the cost involved with handling smart contract messages and storage on a given chain. The testing is very simple but covers a variety of message sizes formats and character-types. Test results are saved locally in CSV, and stored on-chain.
It can also be quickly deployed on many chains with as little modification as possible, dependent on the specific `wasmd` version the target chain houses.

The main intent of this project is to serve as a learning tool, both for myself and for any developers who may be proficient in the various languages, but fairly new to the ecosystem overall. Going through the overall process should provide a solid baseline on how to work with Cosmos SDK in general.

*An example result (using default parameters on Babylon testnet) is published in this [analysis report](https://gist.github.com/Cordtus/8753d81f135055e06973894cb3455f05).*

---

## Features

- **Automated Gas Testing**: Test gas consumption for various message sizes, formats, and character types
- **On-Chain Storage**: Results are stored in the contract itself providing persistence and verifiability
- **Analytics**: Generate statistical analysis with regression models to predict costs
- **Transaction Proofs**: Store transaction hashes as proof of testing
- **Fully Automated Workflow**: From contract deployment to analysis with minimal configuration
- **Multi-Chain Support**: Configurable for any CosmWasm-enabled blockchain

---

## Structure

```ini
cw-gas-test/
├── src/                 # Rust contract code
│   └── lib.rs           # Gas testing contract
├── artifacts/           # Compiled contract (after build)
├── scripts/             # JavaScript automation
│   ├── config.js        # Chain configuration
│   ├── deploy.js        # Contract deployment
│   ├── test-gas.js      # Gas testing script
│   ├── analyze-results.js # Analysis of results
│   ├── package.json     # JS dependencies
│   ├── deployments.json # (Optional) tracks deployed addresses per chain
│   └── .env             # Mnemonic ONLY (create from template)
├── Cargo.toml           # Rust dependencies
├── rust-toolchain.toml  # Rust version spec
├── build.sh             # Compilation script (build contract only)
├── analyze_results.py   # [Optional] Python data visualization
└── cw-gas-test.sh       # Complete workflow (build + deploy + test + analyze)
```

---

## Setup Instructions

### Prerequisites

1. **Rust** (1.74.0+)
2. **Node.js** (v18.0.0+)
3. **Yarn** (or npm)
4. **Docker** (for contract optimization)
5. **Fee tokens** on the target network (enough to cover contract deployment and test transactions)
6. **`jq`** (for JSON parsing in scripts)
7. **Python** (optional, for extra visualization)

---

### 1. Clone & Initial Prep

```bash
git clone https://github.com/Cordtus/cw-gas-test.git
cd cw-gas-test

# Make the scripts executable
chmod +x build.sh cw-gas-test.sh
```

---

### 2. Configure Your Chain Settings

Network settings and other variables must be set in `scripts/config.js`.
Example:

```js
// =============================
// CHAIN CONFIGURATION
// =============================
// Edit accordingly for your target chain
export const config = {
  // Network settings
  RPC_ENDPOINT: 'http://localhost:26657',
  REST_ENDPOINT: 'http://localhost:1317',
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
  
  // Optional: Existing contract address if you do NOT want to deploy a new one on target chain.
  // If your target chain is found in deployments.json, the contract address specified there will be used.
  // In any other case, this script will build & deploy a new contract.
  CONTRACT_ADDRESS: '',     // Optional: reuse existing contract [check ./deployments.json]

  // Test configuration
  TEST_MESSAGE_LENGTHS: [1, 10, 50, 100, 200, 500, 1000, 2000],
  OUTPUT_FILE: 'gas_results.csv',
  REQUEST_DELAY: 1000,      // Delay between requests in milliseconds
  TX_CONFIRMATION_TIMEOUT: 10000, // Max time to wait for tx confirmation (ms)
  TX_POLLING_INTERVAL: 3000,      // How often to check for tx confirmation (ms)
};
```

**Important**:

- **`CONTRACT_ADDRESS`** is optional. Leave it blank to trigger **new deployment** (unless one is found in `deployments.json`).  
- If you already have a contract deployed, you can put its address here (or ideally, add it to `deployments.json` and make a PR).

---

### 3. Provide Your Mnemonic in `.env`

- **`.env`** (located in `scripts/`) should contain **only** your wallet mnemonic.  
- Example:

  ```sh
  MNEMONIC="word1 word2 word3 ... word24"
  ```

*key and wallet will be derived using the standard ../118/0/0/0 hdpath*
*12 or 24 word mnemonics are valid*

If `.env` doesn't exist, copy `.env.template` to `.env` and fill in your mnemonic:

```bash
cd scripts
cp .env.template .env
# then edit .env to include your mnemonic
```

**Please make a NEW wallet to use here. In any case, make sure the file is either in your `.gitignore`, or that you do not commit the changes to a public repo.**

---

### 4. Option A: Manually Build & Run Steps

If you only want to **build** the contract artifacts:

```bash
./build.sh
```

This uses Docker to compile and optimize your CosmWasm contract. An optimized `.wasm` is placed in `artifacts/`.

Then you can run the JS scripts separately:

```bash
# From inside "scripts/"
yarn install         # or npm install
yarn deploy          # deploy.js
yarn test            # test-gas.js
yarn analyze         # analyze-results.js
```

This will:

- Deploy (if `CONTRACT_ADDRESS` is empty) or reuse an existing contract.
- Run gas tests [varied message sizes, formats, character types.]
- Generate a report in CSV.

---

### 4. Option B: Full Combined Workflow

A single script, `cw-gas-test.sh`, merges all setup and execution into one pass:

```bash
./cw-gas-test.sh
```

This will:

1. Check for a known contract address (either in `config.js` or `deployments.json`)  
2. Build the contract if needed (via `./build.sh`)  
3. Deploy the contract if none is set  
4. Run the test suite (`test-gas.js`)  
5. Generate an analysis report (`analyze-results.js`)  
6. Optionally run Python visualization if Python/pip are installed  

When complete, you'll see:

- **`gas_results.csv`** – Raw test data
- **`gas_analysis.md`** – High-level summary with regression analysis  
- **`gas_analysis.png`** – (If using Python) Visualization of the results

---

## Contract

The smart contract includes:

1. **Message Storage**:
   - `StoreMessage`: Store any message with its actual length
   - `StoreFixedLength`: Store a message padded/truncated to a specific length

2. **Test Run Data**:
   - `RecordTestRun`: Save aggregated test data with transaction proofs
   - `ClearData`: Remove old test data (admin only)

3. **Queries**:
   - `GetConfig`: Contract configuration
   - `GetMessage`: Retrieve stored message by ID
   - `ListMessages`: List stored messages (paginated)
   - `GetTestRuns`: Retrieve test run statistics (paginated)
   - `GetGasSummary`: Get gas usage analysis summary

---

## Customizing Tests

You can edit parameters in `scripts/config.js` (like `TEST_MESSAGE_LENGTHS`, network endpoints) to suit your environment:

```js
TEST_MESSAGE_LENGTHS: [1, 100, 500, 1000],
```

### Advanced Testing

The test suite examines:

1. **Message Length**: Test how gas scales with increasing message size
2. **Message Format**: Compare JSON, Base64, and Hex encoded data
3. **Character Type**: Test different characters (ASCII, Unicode, Emoji)

To modify test parameters or add new test types:

1. Edit `test-gas.js` to add new test functions
2. Update the corresponding contract message handlers in `lib.rs`
3. Modify `analyze-results.js` to include new metrics in the analysis

---

## Using an Existing Contract

If you already have a contract deployed:

1. Put its address into `config.js` under `CONTRACT_ADDRESS`, **or**  
2. Place the address in `scripts/deployments.json` for the target chain:
   Example Formatting:

   ```json
   {"deployments": [{"chainId":"contractAddress"}]}
   ```

3. Please [submit a pull request](https://github.com/Cordtus/cw-gas-test/compare) to include your contribution!

*If your target chain exists in *deployments.json*, the scripts will skip re-deployment and run tests directly.*

---

## Regression Analysis

The project performs linear regression on gas costs to model:

```ini
Total Gas = Base Cost + (Marginal Cost × Message Size)
```

---

## Adapting for Other Chains

This tool can be easily adapted for other CosmWasm-enabled chains:

- Update `config.js` with target chain RPC endpoints, gas price, address prefix etc.
- Rebuild contract if required by a breaking `wasmd` version update (e.g., changes in `cosmwasm-std` dependencies):
  - Update `Cargo.toml` dependencies to match target chain
  - Recompile with `./build.sh`

*Directory of [CosmWasm enabled networks](https://cosmwasm.com/adoption), courtesy of [Confio](https://confio.gmbh/).
Refer to the [Cosmos Chain Registry](https://github.com/cosmos/chain-registry) for chain parameters and other information.*

## Potential Challenges & Troubleshooting

Throughout the development of this project, there were some notable challenges:

### Cross-Chain Compatibility

- **Different CosmWasm Versions**: Chains may run different CosmWasm versions, requiring adjustments to the contract code. Always check the target chain's `wasmd` version before deployment.
- **Gas Limit Variations**: Some chains have stricter gas limits than others, which can cause issues with large message tests.
- **RPC Endpoint Reliability**: Public RPC endpoints can be unstable. Consider using multiple endpoints or setting up your own for critical testing.

### JavaScript Integration Challenges

- **Message Name Alignment**: Ensure js function calls match the contract's ExecuteMsg enum variants exactly. The snake_case vs. camelCase conversion may cause headaches.
- **Transaction Confirmation**: Different chains have vastly differnt block times and even slightly different query response formatting. Our polling approach may need adjustments for specific chains.

### Data Analysis Considerations

- **Gas Cost Variability**: Gas costs on some chains will vary based on current block utilization, so any "cost" analysis should be viewed as approximations rather than exact predictions. The gas "amount" may be more useful than the "cost".
- **Regression Model Limitations**: The linear regression model assumes a linear relationship between message size and gas cost, which may not hold across all ranges of message sizes. [Shared test results will be happily accepted!]

### Workflow Optimization

- **WASM Optimization**: Building optimized WASM files can take some time, especially on slower machines. Larger (unoptimized) contracts may not be possible to upload on some chains.
- **Mnemonic Security**: Always use a dedicated testing wallet with minimal funds when automating transactions, and make use of testnets where possible.

### Common Problems

*RPC errors*:  

- Try a different RPC in `config.js` or verify your endpoints are correct.
- Add timeout/retry logic by editing the `REQUEST_DELAY` and `TX_CONFIRMATION_TIMEOUT` in `config.js`.

*Out of gas errors*:  

- Increase `GAS_ADJUSTMENT` or use a higher `GAS_PRICE` in `config.js`.
- For very large messages, you might need to increase the default gas limit in the chain's configuration.

*Deployment failures*:  

- Make sure your wallet mnemonic has enough tokens to pay fees.
- Check transaction logs using the chain's explorer.
- Verify the contract code is compatible with the chain's CosmWasm version.

*Permission issues*:  

- Docker or file-permission problems can often be fixed with `chmod +x <script>` or adjusting directory ownership.

*Transaction confirmation timeouts*:  

- If transactions are slow to confirm, increase `TX_CONFIRMATION_TIMEOUT` in `config.js`.
- In congested networks, increase `TX_POLLING_INTERVAL` to reduce API call frequency.

---

## License

Licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
