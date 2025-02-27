import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';
import { deployGasTestContract } from './deploy.js';

dotenv.config();

// Helper functions
function generateString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function testSingleCharacters(client, contractAddress, signer) {
    console.log('\n--- Testing Single Characters ---');
    const results = [];
    
    // Test a variety of single characters
    const testChars = ['a', 'Z', '9', '#', '@', '中', '😀'];
    
    for (const char of testChars) {
        console.log(`Testing character: '${char}'`);
        
        const msg = {
            store_message: {
                content: char
            }
        };
        
        const result = await client.execute(
            signer,
            contractAddress,
            msg,
            'auto'
        );
        
        const gasUsed = parseInt(result.gasUsed);
        const fee = (gasUsed * 0.002) / 1000000;
        
        console.log(`Character: '${char}', Length: ${char.length}, Gas used: ${gasUsed}, Fee: ${fee} BBN`);
        results.push({ character: char, length: 1, gasUsed, fee });
    }
    
    return results;
}

async function testMessageLengths(client, contractAddress, signer) {
    console.log('\n--- Testing Message Lengths ---');
    const results = [];
    
    for (const length of config.TEST_MESSAGE_LENGTHS) {
        console.log(`Testing message length: ${length}`);
        
        const message = generateString(length);
        const msg = {
            store_fixed_length_message: {
                content: message,
                target_length: length
            }
        };
        
        const result = await client.execute(
            signer,
            contractAddress,
            msg,
            'auto'
        );
        
        const gasUsed = parseInt(result.gasUsed);
        const fee = (gasUsed * 0.002) / 1000000;
        
        console.log(`Length: ${length}, Gas used: ${gasUsed}, Fee: ${fee} BBN`);
        results.push({ length, gasUsed, fee });
    }
    
    return results;
}

async function testMessageFormats(client, contractAddress, signer) {
    console.log('\n--- Testing Message Formats ---');
    const results = [];
    
    // Test JSON
    const jsonMessage = JSON.stringify({ name: "Test", values: [1, 2, 3], active: true });
    console.log(`Testing JSON format (${jsonMessage.length} bytes)`);
    
    let result = await client.execute(
        signer,
        contractAddress,
        { store_message: { content: jsonMessage } },
        'auto'
    );
    
    let gasUsed = parseInt(result.gasUsed);
    let fee = (gasUsed * 0.002) / 1000000;
    
    console.log(`Format: JSON, Length: ${jsonMessage.length}, Gas used: ${gasUsed}, Fee: ${fee} BBN`);
    results.push({ format: 'JSON', length: jsonMessage.length, gasUsed, fee });
    
    // Test Base64
    const base64Message = Buffer.from("This is a test message for Base64 encoding").toString('base64');
    console.log(`Testing Base64 format (${base64Message.length} bytes)`);
    
    result = await client.execute(
        signer,
        contractAddress,
        { store_message: { content: base64Message } },
        'auto'
    );
    
    gasUsed = parseInt(result.gasUsed);
    fee = (gasUsed * 0.002) / 1000000;
    
    console.log(`Format: Base64, Length: ${base64Message.length}, Gas used: ${gasUsed}, Fee: ${fee} BBN`);
    results.push({ format: 'Base64', length: base64Message.length, gasUsed, fee });
    
    // Test Hex
    const hexMessage = Buffer.from("This is a test message for Hex encoding").toString('hex');
    console.log(`Testing Hex format (${hexMessage.length} bytes)`);
    
    result = await client.execute(
        signer,
        contractAddress,
        { store_message: { content: hexMessage } },
        'auto'
    );
    
    gasUsed = parseInt(result.gasUsed);
    fee = (gasUsed * 0.002) / 1000000;
    
    console.log(`Format: Hex, Length: ${hexMessage.length}, Gas used: ${gasUsed}, Fee: ${fee} BBN`);
    results.push({ format: 'Hex', length: hexMessage.length, gasUsed, fee });
    
    return results;
}

async function saveResults(results) {
    // Create CSV header
    let csv = 'Message Length,Gas Used,Cost (BBN)\n';
    
    // Add numeric results
    for (const result of results.lengthResults) {
        csv += `${result.length},${result.gasUsed},${result.fee}\n`;
    }
    
    // Add format results
    for (const result of results.formatResults) {
        csv += `${result.format} (${result.length}),${result.gasUsed},${result.fee}\n`;
    }
    
    // Add character results
    for (const result of results.charResults) {
        csv += `'${result.character}',${result.gasUsed},${result.fee}\n`;
    }
    
    // Save to file
    fs.writeFileSync(config.OUTPUT_FILE, csv);
    console.log(`\nResults saved to ${config.OUTPUT_FILE}`);
}

async function runGasTests() {
    try {
        let client, contractAddress, signer;
        
        // Check if contract address is provided
        if (process.env.CONTRACT_ADDRESS) {
            console.log(`Using existing contract: ${process.env.CONTRACT_ADDRESS}`);
            contractAddress = process.env.CONTRACT_ADDRESS;
            
            // Create wallet from mnemonic
            const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
                prefix: 'bbn',
            });
            const [firstAccount] = await wallet.getAccounts();
            signer = firstAccount.address;
            
            // Create signing client
            client = await SigningCosmWasmClient.connectWithSigner(
                process.env.RPC_ENDPOINT || config.RPC_ENDPOINT,
                wallet,
                {
                    gasPrice: GasPrice.fromString(process.env.GAS_PRICE || config.GAS_PRICE),
                }
            );
        } else {
            // Deploy new contract
            console.log('Deploying new contract for testing...');
            const deployResult = await deployGasTestContract();
            client = deployResult.client;
            contractAddress = deployResult.contractAddress;
            signer = deployResult.signer;
        }
        
        console.log(`Starting gas tests on contract: ${contractAddress}`);
        
        // Test single characters
        const charResults = await testSingleCharacters(client, contractAddress, signer);
        
        // Test different message lengths
        const lengthResults = await testMessageLengths(client, contractAddress, signer);
        
        // Test different formats
        const formatResults = await testMessageFormats(client, contractAddress, signer);
        
        // Save results to CSV
        await saveResults({ charResults, lengthResults, formatResults });
        
    } catch (error) {
        console.error('Error during gas testing:', error);
        process.exit(1);
    }
}

runGasTests();