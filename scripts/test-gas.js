// src/test-gas.js

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';
import fetch from 'node-fetch';

dotenv.config(); // Load MNEMONIC from .env

/**
 * Gas testing utility for CosmWasm contracts
 * 
 * Automated tests on a deployed contract to measure and record
 * gas consumption for different message types, sizes, and formats.
 */

// Constants from config
const tokenDenom = config.TOKEN_DENOM;
const gasPrice = parseFloat(config.GAS_PRICE.replace(/[^0-9.]/g, ''));

// Default values for timeouts [if not specified in config]
const TX_CONFIRMATION_TIMEOUT = config.TX_CONFIRMATION_TIMEOUT || 60000; // Default: 60 seconds
const TX_POLLING_INTERVAL = config.TX_POLLING_INTERVAL || 3000; // Default: 3 seconds
const MAX_PARALLEL_REQUESTS = config.MAX_PARALLEL_REQUESTS || 3; // Default: 3 parallel requests

/**
 * Helper to add a delay
 * @param {number} ms - milliseconds to delay
 * @returns {Promise} - resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random string of specified length
 * @param {number} length - desired string length
 * @returns {string} - random string
 */
function generateString(length) {
    return Array.from({ length }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 62))
    ).join('');
}

/**
 * Calculate fee from gas used
 * @param {number} gasUsed - amount of gas used
 * @returns {string} - formatted fee with precision
 */
function calculateFee(gasUsed) {
    return (gasUsed * gasPrice).toFixed(6);
}

/**
 * Create client connected to blockchain
 * @returns {Promise<Object>} - client and signer address
 * @throws {Error} - if mnemonic is missing or connection fails
 */
async function createClient() {
    if (!process.env.MNEMONIC || process.env.MNEMONIC.trim() === '') {
        throw new Error('MNEMONIC is missing in .env file');
    }

    try {
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

        console.log(`Connected to ${config.CHAIN_ID} as ${signer}`);
        return { client, signer };
    } catch (error) {
        console.error(`Failed to create client: ${error.message}`);
        throw error;
    }
}

/**
 * Wait for transaction to be confirmed via REST API
 * @param {string} txHash - transaction hash to monitor
 * @returns {Promise<boolean>} - true when confirmed
 * @throws {Error} - if confirmation times out or transaction fails
 */
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

/**
 * Execute contract with confirmation
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} signer - signer address
 * @param {string} contractAddress - contract address
 * @param {Object} msg - message to execute
 * @returns {Promise<Object>} - transaction result
 */
async function executeWithConfirmation(client, signer, contractAddress, msg) {
    try {
        const result = await client.execute(signer, contractAddress, msg, 'auto');
        
        // Wait for the transaction to be confirmed
        await getTxResponse(result.transactionHash);
        
        return result;
    } catch (error) {
        console.error(`Transaction execution failed: ${error.message}`);
        throw error;
    }
}

/**
 * Test single-character messages
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} contractAddress - contract address
 * @param {string} signer - signer address
 * @returns {Promise<Array>} - test results
 */
async function testSingleCharacters(client, contractAddress, signer) {
    console.log('\n--- Testing Single Characters ---');
    const results = [];
    
    const testChars = ['a', 'Z', '9', '#', '@', '中', '😀'];
    const testDescriptions = [
        'ASCII lowercase', 
        'ASCII uppercase', 
        'ASCII numeric', 
        'ASCII symbol', 
        'ASCII symbol', 
        'Unicode CJK', 
        'Unicode emoji'
    ];

    // Process characters in batches for better performance
    const batchSize = MAX_PARALLEL_REQUESTS;
    for (let i = 0; i < testChars.length; i += batchSize) {
        const batch = testChars.slice(i, i + batchSize);
        const batchDescriptions = testDescriptions.slice(i, i + batchSize);
        
        console.log(`Testing character batch ${i/batchSize + 1}...`);
        
        const promises = batch.map(async (char, index) => {
            try {
                console.log(`Testing character: '${char}' (${batchDescriptions[index]})`);
                
                const msg = { store_message: { content: char } };
                const result = await executeWithConfirmation(client, signer, contractAddress, msg);
                
                const gasUsed = parseInt(result.gasUsed);
                const fee = calculateFee(gasUsed);

                console.log(`Character: '${char}', Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
                
                return { 
                    character: char, 
                    type: batchDescriptions[index],
                    gasUsed, 
                    fee,
                    txHash: result.transactionHash 
                };
            } catch (error) {
                console.error(`Error testing character '${char}': ${error.message}`);
                return { 
                    character: char, 
                    type: batchDescriptions[index],
                    error: error.message 
                };
            }
        });
        
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
        
        // Add delay between batches
        if (i + batchSize < testChars.length) {
            await delay(config.REQUEST_DELAY || 1000);
        }
    }

    const successCount = results.filter(r => !r.error).length;
    console.log(`Completed character tests: ${successCount}/${testChars.length} successful`);

    return results;
}

/**
 * Test different message lengths
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} contractAddress - contract address
 * @param {string} signer - signer address
 * @returns {Promise<Array>} - test results
 */
async function testMessageLengths(client, contractAddress, signer) {
    console.log('\n--- Testing Message Lengths ---');
    const results = [];

    // Process message lengths in sequential batches
    // We process sequentially to better observe the gas increase pattern
    for (let i = 0; i < config.TEST_MESSAGE_LENGTHS.length; i += MAX_PARALLEL_REQUESTS) {
        const batch = config.TEST_MESSAGE_LENGTHS.slice(i, i + MAX_PARALLEL_REQUESTS);
        
        const promises = batch.map(async (length) => {
            try {
                console.log(`Testing message length: ${length}`);
                
                const message = generateString(length);
                const msg = { store_fixed_length: { content: message, length: length } };

                const result = await executeWithConfirmation(client, signer, contractAddress, msg);
                const gasUsed = parseInt(result.gasUsed);
                const fee = calculateFee(gasUsed);

                console.log(`Length: ${length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
                
                return { 
                    length, 
                    gasUsed, 
                    fee, 
                    txHash: result.transactionHash 
                };
            } catch (error) {
                console.error(`Error testing message length ${length}: ${error.message}`);
                return { 
                    length, 
                    error: error.message 
                };
            }
        });
        
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
        
        // Add delay between batches
        if (i + MAX_PARALLEL_REQUESTS < config.TEST_MESSAGE_LENGTHS.length) {
            await delay(config.REQUEST_DELAY || 1000);
        }
    }

    const successCount = results.filter(r => !r.error).length;
    console.log(`Completed length tests: ${successCount}/${config.TEST_MESSAGE_LENGTHS.length} successful`);

    return results;
}

/**
 * Test different message formats (JSON, Base64, Hex)
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} contractAddress - contract address
 * @param {string} signer - signer address
 * @returns {Promise<Array>} - test results
 */
async function testMessageFormats(client, contractAddress, signer) {
    console.log('\n--- Testing Message Formats ---');
    const results = [];

    const formats = [
        { 
            name: "JSON", 
            content: JSON.stringify({ 
                name: "Test", 
                values: [1, 2, 3], 
                active: true,
                metadata: {
                    created: new Date().toISOString(),
                    tags: ["test", "gas", "format"]
                }
            })
        },
        { 
            name: "Base64", 
            content: Buffer.from("This is a test message for Base64 encoding").toString('base64') 
        },
        { 
            name: "Hex", 
            content: Buffer.from("This is a test message for Hex encoding").toString('hex') 
        },
        {
            name: "UTF8",
            content: "UTF8 characters: é, ñ, 中, 日, こんにちは, 안녕하세요, привет, γεια, 😀, 🚀, 🌍"
        }
    ];

    // Process formats in parallel
    try {
        const promises = formats.map(async (format) => {
            console.log(`Testing ${format.name} format (${format.content.length} bytes)`);

            try {
                const result = await executeWithConfirmation(
                    client, 
                    signer, 
                    contractAddress, 
                    { store_message: { content: format.content } }
                );
                
                const gasUsed = parseInt(result.gasUsed);
                const fee = calculateFee(gasUsed);

                console.log(`Format: ${format.name}, Length: ${format.content.length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
                
                return { 
                    format: format.name, 
                    length: format.content.length, 
                    gasUsed, 
                    fee,
                    txHash: result.transactionHash 
                };
            } catch (error) {
                console.error(`Error testing format ${format.name}: ${error.message}`);
                return { 
                    format: format.name, 
                    length: format.content.length, 
                    error: error.message 
                };
            }
        });

        const formatResults = await Promise.all(promises);
        results.push(...formatResults);
        
        const successCount = results.filter(r => !r.error).length;
        console.log(`Completed format tests: ${successCount}/${formats.length} successful`);
        
    } catch (error) {
        console.error(`Error during format testing: ${error.message}`);
    }

    return results;
}

/**
 * Record test data on-chain
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} contractAddress - contract address
 * @param {string} signer - signer address
 * @param {Array} results - test results to record
 * @returns {Promise<Object>} - transaction result
 */
async function recordTestResults(client, contractAddress, signer, results) {
    console.log('\n--- Recording Test Results On-Chain ---');
    
    // Filter out results with errors
    const validResults = results.filter(result => !result.error);
    
    // Aggregate results
    const totalGasUsed = validResults.reduce((sum, result) => sum + result.gasUsed, 0);
    
    // Calculate total bytes across different test types
    const totalBytes = validResults.reduce((sum, result) => {
        // Handle different result types
        if (result.length) {
            // Message length tests
            return sum + result.length;
        } else if (result.character) {
            // Character tests - count as 1 byte for simplicity
            // This is an approximation since characters can be multi-byte
            return sum + 1;
        } else {
            return sum;
        }
    }, 0);
    
    const avgGasPerByte = totalBytes > 0 ? Math.round(totalGasUsed / totalBytes) : 0;
    
    // Collect tx hashes as proof
    const txHashes = validResults
        .map(result => result.txHash)
        .filter(Boolean)
        .join(',');
    
    // Create unique run ID with timestamp
    const runId = `run_${Date.now()}`;
    
    const msg = {
        record_test_run: {
            run_id: runId,
            count: validResults.length,
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

/**
 * Query gas summary from contract
 * @param {Object} client - SigningCosmWasmClient instance
 * @param {string} contractAddress - contract address
 * @returns {Promise<Object>} - gas summary
 */
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

/**
 * Save results to CSV
 * @param {Object} results - object containing test results
 * @returns {Promise<void>}
 */
async function saveResults(results) {
    let csv = `Message Length,Gas Used,Cost (${tokenDenom}),Tx Hash,Test Type\n`;

    // Process length results
    for (const result of results.lengthResults) {
        if (!result.error) {
            csv += `${result.length},${result.gasUsed},${result.fee},${result.txHash || ''},"Length Test"\n`;
        }
    }

    // Process format results
    for (const result of results.formatResults) {
        if (!result.error) {
            csv += `${result.format} (${result.length}),${result.gasUsed},${result.fee},${result.txHash || ''},"Format Test"\n`;
        }
    }

    // Process character results
    for (const result of results.charResults) {
        if (!result.error) {
            csv += `'${result.character}',${result.gasUsed},${result.fee},${result.txHash || ''},"Character Test (${result.type})"\n`;
        }
    }

    fs.writeFileSync(config.OUTPUT_FILE, csv);
    console.log(`\nResults saved to ${config.OUTPUT_FILE}`);
}

/**
 * Test execution handler with retry capability
 * @param {function} testFn - test function to run
 * @param {Array} params - parameters for test function
 * @param {string} testName - name of test for logging
 * @param {number} maxRetries - maximum number of retries
 * @returns {Promise<Array>} - test results
 */
async function runTestWithRetry(testFn, params, testName, maxRetries = 2) {
    let attempts = 0;
    
    while (attempts <= maxRetries) {
        try {
            attempts++;
            return await testFn(...params);
        } catch (error) {
            if (attempts > maxRetries) {
                console.error(`${testName} failed after ${maxRetries} retries: ${error.message}`);
                throw error;
            }
            console.log(`${testName} attempt ${attempts} failed, retrying... (${error.message})`);
            await delay(config.REQUEST_DELAY * 2 || 2000);
        }
    }
}

/**
 * Run gas tests
 * @returns {Promise<void>}
 */
async function runGasTests() {
    try {
        if (!config.CONTRACT_ADDRESS || config.CONTRACT_ADDRESS.trim() === '') {
            console.error('No contract address provided in config.js');
            console.error('Please update config.CONTRACT_ADDRESS with a valid contract address');
            process.exit(1);
        }
        
        const startTime = Date.now();
        console.log(`Starting gas tests on contract: ${config.CONTRACT_ADDRESS}`);
        console.log(`Chain ID: ${config.CHAIN_ID}, RPC: ${config.RPC_ENDPOINT}`);
        console.log(`Test configuration: ${config.TEST_MESSAGE_LENGTHS.length} length tests, format tests, character tests`);
        
        const { client, signer } = await createClient();
        
        // Run tests with retry capability
        const charResults = await runTestWithRetry(
            testSingleCharacters, 
            [client, config.CONTRACT_ADDRESS, signer], 
            "Character tests"
        );
        
        const lengthResults = await runTestWithRetry(
            testMessageLengths, 
            [client, config.CONTRACT_ADDRESS, signer], 
            "Message length tests"
        );
        
        const formatResults = await runTestWithRetry(
            testMessageFormats, 
            [client, config.CONTRACT_ADDRESS, signer], 
            "Format tests"
        );
        
        // Add tx hashes to results [if exist]
        const allResults = [
            ...charResults.map(r => ({ ...r, length: 1 })),
            ...lengthResults,
            ...formatResults
        ].filter(r => !r.error);
        
        // Record results on-chain
        await recordTestResults(client, config.CONTRACT_ADDRESS, signer, allResults);
        
        // Query gas summary
        await queryGasSummary(client, config.CONTRACT_ADDRESS);

        // Save results to CSV
        await saveResults({ charResults, lengthResults, formatResults });
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`All tests completed successfully in ${duration} seconds`);

    } catch (error) {
        console.error('Error during gas testing:', error);
        process.exit(1);
    }
}

// Run tests if executed directly
if (import.meta.url.endsWith('test-gas.js')) {
    runGasTests();
}

export { 
    runGasTests, 
    testSingleCharacters, 
    testMessageLengths, 
    testMessageFormats 
};