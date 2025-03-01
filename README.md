# CW Gas Test

A toolkit for measuring and analyzing gas costs associated with contract execution and data storage on CosmWasm-enabled blockchains.  
This repository contains a CosmWasm smart contract and automated testing tools to measure transaction costs for various message sizes and formats.

*An example result (using default parameters on Babylon testnet) is published in this [analysis report](https://gist.github.com/Cordtus/8753d81f135055e06973894cb3455f05).*

---

## Project Structure

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
};
```

**Important**:

- **`CONTRACT_ADDRESS`** is optional. Leave it blank to trigger **new deployment** (unless one is found in `deployments.json`).  
- If you already have a contract deployed, you can put its address here (or ideally, add it to `deployments.json` and make  PR).

---

### 3. Provide Your Mnemonic in `.env`

- **`.env`** (located in `scripts/`) should contain **only** your wallet mnemonic.  
- Example:

  ```sh
  MNEMONIC="word1 word2 word3 ... word24"
  ```

*key and wallet will be derived using the standard ../118/0/0/0 hdpath*
*12 or 24 word mnemonics are valid*

If `.env` doesn’t exist, copy `.env.template` to `.env` and fill in your mnemonic:

```bash
cd scripts
cp .env.template .env
# then edit .env to include your 24-word mnemonic
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
- Run gas tests.
- Produce `gas_results.csv` and `gas_analysis.md`.

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
6. Optionally run any Python analysis if your system has Python/pip installed  

When complete, you’ll see:

- **`gas_results.csv`** – Raw test data
- **`gas_analysis.md`** – High-level summary  
- Possibly a `gas_analysis.png` with a modified python script

---

## Customizing Tests

You can edit parameters in `scripts/config.js` (like `TEST_MESSAGE_LENGTHS`, or chain endpoints) to suit your environment:

```js
TEST_MESSAGE_LENGTHS: [1, 100, 500, 1000],
```

### More advanced testing

If you have any ideas for additional tests, or to improve the existing ones, please submit a pull request with your contributions.

---

## Using an Existing Contract

If you already have a contract deployed:

1. Put its address into `config.js` under `CONTRACT_ADDRESS`, **or**  
2.a. Place the address in `scripts/deployments.json` for the target chain:
Example Formatting:
`{"chainId":"contractAddress"}
2.b. Please [submit a pull request](https://github.com/Cordtus/cw-gas-test/compare) to include your contribution!

*If your target chain exists in *deployments.json*, the scripts will skip re-deployment and run tests directly. Please do not use the automated workflow bash script if this breaks your specific use-case.*

---

## Adapting for Other Chains

This tool can be easily adapted for other CosmWasm-enabled chains:

- Update `config.js` with target chain RPC endpoints, gas price, address prefix etc.
- Rebuild contract if required by a breaking `wasmd` version update (e.g., changes in `cosmwasm-std` dependencies):
  - Update `Cargo.toml` dependencies to match target chain
  - Recompile with `./build.sh`

*Directory of [CosmWasm enabled networks](https://cosmwasm.com/adoption), courtesy of [Confio](https://confio.gmbh/).
Refer to the [Cosmos Chain Registry](https://github.com/cosmos/chain-registry) for chain parameters and other information.

## Troubleshooting

**RPC errors**  

- Try a different RPC in `config.js` or verify your endpoints are correct.

**Out of gas errors**  

- Increase `GAS_ADJUSTMENT` or use a higher `GAS_PRICE` in `config.js`.

**Deployment failures**  

- Make sure your wallet mnemonic has enough tokens to pay fees.

**Permission issues**  

- Docker or file-permission problems can often be fixed with `chmod +x <script>` or adjusting directory ownership.

---

## License

Licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
