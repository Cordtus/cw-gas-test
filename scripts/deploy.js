// src/deploy.js

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';

dotenv.config();

// If new contract is instantiated, adds address to config.js for subsequent test functions
function storeAddress(contractAddress) {
    try {
        const configPath = './config.js';
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Replace the CONTRACT_ADDRESS value with the new contract address
        configContent = configContent.replace(
            /CONTRACT_ADDRESS: ['"].*['"]/,
            `CONTRACT_ADDRESS: '${contractAddress}'`
        );
        
        fs.writeFileSync(configPath, configContent);
        console.log(`Config.js updated with contract address: ${contractAddress}`);
        
        // Optionally update deployments.json
        updateDeploymentJson(contractAddress);
        
        return true;
    } catch (error) {
        console.error('Error updating config.js:', error);
        return false;
    }
}

// Add contract to deployments.json by chain_id
function updateDeploymentJson(contractAddress) {
    try {
        const deploymentsPath = './deployments.json';
        let deploymentsContent = {};
        
        // Read file if exists
        if (fs.existsSync(deploymentsPath)) {
            deploymentsContent = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
        }
        
        // Ensure deployments array exists
        if (!deploymentsContent.deployments) {
            deploymentsContent.deployments = [];
        }
        
        // Check if chain_id exists
        const chainExists = deploymentsContent.deployments.some(
            deployment => Object.keys(deployment)[0] === config.CHAIN_ID
        );
        
        if (chainExists) {
            // Update existing entry if exists
            deploymentsContent.deployments = deploymentsContent.deployments.map(deployment => {
                if (Object.keys(deployment)[0] === config.CHAIN_ID) {
                    return { [config.CHAIN_ID]: contractAddress };
                }
                return deployment;
            });
        } else {
            // Add new entry if not exists
            deploymentsContent.deployments.push({ [config.CHAIN_ID]: contractAddress });
        }
        
        fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentsContent, null, 2));
        console.log(`Deployments.json updated with contract address for chain ${config.CHAIN_ID}`);
        
        return true;
    } catch (error) {
        console.error('Error updating deployments.json:', error);
        return false;
    }
}

async function deployGasTestContract() {
    try {
        if (!process.env.MNEMONIC) {
            throw new Error('MNEMONIC environment variable is required');
        }

        console.log(`Deploying Contract to ${config.CHAIN_ID} via ${config.RPC_ENDPOINT}`);

        // Generate wallet
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
            prefix: config.ADDRESS_PREFIX,
        });
        const [firstAccount] = await wallet.getAccounts();
        console.log('Deploying from address:', firstAccount.address);

        // Create signer
        const client = await SigningCosmWasmClient.connectWithSigner(
            config.RPC_ENDPOINT,
            wallet,
            {
                gasPrice: GasPrice.fromString(config.GAS_PRICE),
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

        // Instantiate contract - empty instantiate message
        console.log('Instantiating contract...');
        const instantiateMsg = {};

        const instantiateResult = await client.instantiate(
            firstAccount.address,
            uploadResult.codeId,
            instantiateMsg,
            config.CONTRACT_LABEL,
            'auto'
        );
        console.log('Contract address:', instantiateResult.contractAddress);
        
        // Update config.js with the new contract address
        const updated = storeAddress(instantiateResult.contractAddress);
        if (!updated) {
            console.error('Failed to write contract address to config file. Check file permissions.');
        }
        
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
if (import.meta.url.endsWith('deploy.js')) {
    deployGasTestContract();
}

export { deployGasTestContract };