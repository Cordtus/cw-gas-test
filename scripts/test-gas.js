// src/test-gas.js

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';
import fetch from 'node-fetch';

dotenv.config(); // Load MNEMONIC from .env

const tokenDenom = config.TOKEN_DENOM;
const gasPrice = parseFloat(config.GAS_PRICE.replace(/[^0-9.]/g, ''));

// Default values for timeouts [if not specified in config]
const TX_CONFIRMATION_TIMEOUT = config.TX_CONFIRMATION_TIMEOUT || 60000; // Default: 60 seconds
const TX_POLLING_INTERVAL = config.TX_POLLING_INTERVAL || 3000; // Default: 3 seconds

// Helper function to introduce delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateString(length) {
    return Array.from({ length }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 62))
    ).join('');
}

function calculateFee(gasUsed) {
    return (gasUsed * gasPrice).toFixed(6);
}

async function createClient() {
    if (!process.env.MNEMONIC || process.env.MNEMONIC.trim() === '') {
        throw new Error('MNEMONIC is missing in .env file');
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
        prefix: config.ADDRESS_PREFIX,
    });

    const [firstAccount] = await wallet.getAccounts();
    const signer = firstAccount.address;

    const client = await SigningCosmWasmClient.connectWithSigner(
        config.RPC_ENDPOINT,
        wallet,
        {
            gasPrice: GasPrice.fromString(config.GAS_PRICE),
        }
    );

    return { client, signer };
}

// Wait for transaction to be confirmed via REST API
async function getTxResponse(txHash) {
    console.log(`Waiting for transaction ${txHash} to be confirmed...`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < TX_CONFIRMATION_TIMEOUT) {
        try {
            const response = await fetch(`${config.REST_ENDPOINT}/cosmos/tx/v1beta1/txs/${txHash}`);
            
            if (response.status === 200) {
                const txData = await response.json();
                if (txData && txData.tx_response) {
                    if (txData.tx_response.code === 0) {
                        console.log(`Transaction confirmed in block ${txData.tx_response.height}`);
                        return true;
                    } else {
                        throw new Error(`Transaction failed with code ${txData.tx_response.code}: ${txData.tx_response.raw_log}`);
                    }
                }
            } else if (response.status !== 404) {
                // If not 404 (not found), log the error
                console.log(`Unexpected response status: ${response.status}`);
            }
        } catch (error) {
            if (!error.message.includes('404')) {
                console.log(`Error checking transaction: ${error.message}`);
            }
        }
        
        // Wait before polling again
        await delay(TX_POLLING_INTERVAL);
    }
    
    throw new Error(`Transaction confirmation timed out after ${TX_CONFIRMATION_TIMEOUT/1000} seconds`);
}

// Execute contract with confirmation
async function executeWithConfirmation(client, signer, contractAddress, msg) {
    const result = await client.execute(signer, contractAddress, msg, 'auto');
    
    // Wait for the transaction to be confirmed
    await getTxResponse(result.transactionHash);
    
    return result;
}

// test single-character messages
async function testSingleCharacters(client, contractAddress, signer) {
    console.log('\n--- Testing Single Characters ---');
    const results = [];
    
    const testChars = ['a', 'Z', '9', '#', '@', '中', '😀'];

    for (const char of testChars) {
        console.log(`Testing character: '${char}'`);
        
        const msg = { store_message: { content: char } };

        const result = await executeWithConfirmation(client, signer, contractAddress, msg);
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Character: '${char}', Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ character: char, gasUsed, fee });
    }

    return results;
}

// test different message lengths
async function testMessageLengths(client, contractAddress, signer) {
    console.log('\n--- Testing Message Lengths ---');
    const results = [];

    for (const length of config.TEST_MESSAGE_LENGTHS) {
        console.log(`Testing message length: ${length}`);
        
        const message = generateString(length);
        const msg = { store_fixed_length: { content: message, length: length } };

        const result = await executeWithConfirmation(client, signer, contractAddress, msg);
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Length: ${length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ length, gasUsed, fee });
    }

    return results;
}

// test different message formats (JSON, Base64, Hex)
async function testMessageFormats(client, contractAddress, signer) {
    console.log('\n--- Testing Message Formats ---');
    const results = [];

    const formats = [
        { name: "JSON", content: JSON.stringify({ name: "Test", values: [1, 2, 3], active: true }) },
        { name: "Base64", content: Buffer.from("This is a test message for Base64 encoding").toString('base64') },
        { name: "Hex", content: Buffer.from("This is a test message for Hex encoding").toString('hex') },
    ];

    for (const format of formats) {
        console.log(`Testing ${format.name} format (${format.content.length} bytes)`);

        const result = await executeWithConfirmation(client, signer, contractAddress, { store_message: { content: format.content } });
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Format: ${format.name}, Length: ${format.content.length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ format: format.name, length: format.content.length, gasUsed, fee });
    }

    return results;
}

// Record test data on-chain
async function recordTestResults(client, contractAddress, signer, results) {
    console.log('\n--- Recording Test Results On-Chain ---');
    
    // Aggregate results
    const totalGasUsed = results.reduce((sum, result) => sum + result.gasUsed, 0);
    const totalBytes = results.reduce((sum, result) => sum + result.length, 0);
    const avgGasPerByte = totalBytes > 0 ? Math.round(totalGasUsed / totalBytes) : 0;
    
    // Collect tx hashes as proof
    const txHashes = results.map(result => result.txHash).filter(Boolean).join(',');
    
    // Create unique run ID with timestamp
    const runId = `run_${Date.now()}`;
    
    const msg = {
        record_test_run: {
            run_id: runId,
            count: results.length,
            gas: totalGasUsed.toString(),
            avg_gas: avgGasPerByte.toString(),
            chain: config.CHAIN_ID,
            tx_proof: txHashes || null
        }
    };
    
    try {
        const result = await executeWithConfirmation(client, signer, contractAddress, msg);
        console.log(`Test results recorded on-chain. Run ID: ${runId}, Gas Used: ${result.gasUsed}`);
        return result;
    } catch (error) {
        console.error('Failed to record test results:', error.message);
        return null;
    }
}

// Query gas summary from contract
async function queryGasSummary(client, contractAddress) {
    try {
        const result = await client.queryContractSmart(contractAddress, { get_gas_summary: {} });
        console.log('\n--- On-Chain Gas Summary ---');
        console.log(`Message Count: ${result.msg_count}`);
        console.log(`Total Gas: ${result.total_gas}`);
        console.log(`Average Gas: ${result.avg_gas}`);
        console.log(`Total Bytes: ${result.total_bytes}`);
        console.log(`Gas Per Byte: ${result.gas_per_byte}`);
        return result;
    } catch (error) {
        console.error('Failed to query gas summary:', error.message);
        return null;
    }
}

// save result to CSV
async function saveResults(results) {
    let csv = `Message Length,Gas Used,Cost (${tokenDenom}),Tx Hash\n`;

    for (const result of results.lengthResults) {
        csv += `${result.length},${result.gasUsed},${result.fee},${result.txHash || ''}\n`;
    }

    for (const result of results.formatResults) {
        csv += `${result.format} (${result.length}),${result.gasUsed},${result.fee},${result.txHash || ''}\n`;
    }

    for (const result of results.charResults) {
        csv += `'${result.character}',${result.gasUsed},${result.fee},${result.txHash || ''}\n`;
    }

    fs.writeFileSync(config.OUTPUT_FILE, csv);
    console.log(`\nResults saved to ${config.OUTPUT_FILE}`);
}

// run tests
async function runGasTests() {
    try {
        if (!config.CONTRACT_ADDRESS || config.CONTRACT_ADDRESS.trim() === '') {
            console.error('No contract address provided in config.js');
            console.error('Please update config.CONTRACT_ADDRESS with a valid contract address');
            process.exit(1);
        }
        
        console.log(`Starting gas tests on contract: ${config.CONTRACT_ADDRESS}`);
        
        const { client, signer } = await createClient();
        
        // Aggregate results with tx hashes
        const charResults = await testSingleCharacters(client, config.CONTRACT_ADDRESS, signer);
        const lengthResults = await testMessageLengths(client, config.CONTRACT_ADDRESS, signer);
        const formatResults = await testMessageFormats(client, config.CONTRACT_ADDRESS, signer);
        
        // Add tx hashes to results [if exist]
        const allResults = [
            ...charResults.map(r => ({ ...r, length: 1 })),
            ...lengthResults,
            ...formatResults
        ];
        
        // Record results on-chain
        await recordTestResults(client, config.CONTRACT_ADDRESS, signer, allResults);
        
        // Query gas summary
        await queryGasSummary(client, config.CONTRACT_ADDRESS);

        await saveResults({ charResults, lengthResults, formatResults });
        console.log("All tests completed successfully");

    } catch (error) {
        console.error('Error during gas testing:', error);
        process.exit(1);
    }
}

runGasTests();