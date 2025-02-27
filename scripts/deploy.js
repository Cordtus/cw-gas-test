import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';

dotenv.config();

// Override config if env vars present
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || config.RPC_ENDPOINT;
const CHAIN_ID = process.env.CHAIN_ID || config.CHAIN_ID;
const GAS_PRICE = process.env.GAS_PRICE || config.GAS_PRICE;

async function deployGasTestContract() {
    try {
        if (!process.env.MNEMONIC) {
            throw new Error('MNEMONIC environment variable is required');
        }

        console.log(`Deploying Gas Test Contract to ${CHAIN_ID} via ${RPC_ENDPOINT}`);

        // Generate wallet from mnemonic
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
            prefix: 'bbn',
        });
        const [firstAccount] = await wallet.getAccounts();
        console.log('Deploying from address:', firstAccount.address);

        // Create signing client
        const client = await SigningCosmWasmClient.connectWithSigner(
            RPC_ENDPOINT,
            wallet,
            {
                gasPrice: GasPrice.fromString(GAS_PRICE),
            }
        );

        // Upload contract
        console.log('Uploading contract...');
        const wasm = fs.readFileSync(config.WASM_PATH);
        const uploadResult = await client.upload(
            firstAccount.address,
            wasm,
            'auto'
        );
        console.log('Upload result:', uploadResult);

        // Instantiate contract
        console.log('Instantiating contract...');
        const instantiateMsg = {
            btc_timestamp_enabled: false,
            babylon_contract: null
        };

        const instantiateResult = await client.instantiate(
            firstAccount.address,
            uploadResult.codeId,
            instantiateMsg,
            config.CONTRACT_LABEL,
            'auto'
        );
        console.log('Contract address:', instantiateResult.contractAddress);
        
        // Return contract info for further operations
        return {
            client,
            contractAddress: instantiateResult.contractAddress,
            signer: firstAccount.address
        };

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (import.meta.url === import.meta.main) {
    deployGasTestContract();
}

export { deployGasTestContract };