// src/test-gas.js

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { config } from './config.js';
import { deployGasTestContract } from './deploy.js';

dotenv.config(); // Load MNEMONIC from .env

const tokenDenom = config.TOKEN_DENOM;
const gasPrice = parseFloat(config.GAS_PRICE.replace(/[^0-9.]/g, ''));

// Helper function to introduce delay between requests
function delay(ms = config.REQUEST_DELAY) {
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

async function createClientAndWallet() {
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

// test single-character messages
async function testSingleCharacters(client, contractAddress, signer) {
    console.log('\n--- Testing Single Characters ---');
    const results = [];
    
    const testChars = ['a', 'Z', '9', '#', '@', '中', '😀'];

    for (const char of testChars) {
        console.log(`Testing character: '${char}'`);
        
        const msg = { store_message: { content: char } };

        const result = await client.execute(signer, contractAddress, msg, 'auto');
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Character: '${char}', Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ character: char, gasUsed, fee });
        
        // Add delay between requests to avoid rate limiting
        await delay();
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
        const msg = { store_fixed_length_message: { content: message, target_length: length } };

        const result = await client.execute(signer, contractAddress, msg, 'auto');
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Length: ${length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ length, gasUsed, fee });
        
        // Add delay between requests to avoid rate limiting
        await delay();
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

        const result = await client.execute(signer, contractAddress, { store_message: { content: format.content } }, 'auto');
        const gasUsed = parseInt(result.gasUsed);
        const fee = calculateFee(gasUsed);

        console.log(`Format: ${format.name}, Length: ${format.content.length}, Gas used: ${gasUsed}, Fee: ${fee}${tokenDenom}`);
        results.push({ format: format.name, length: format.content.length, gasUsed, fee });
        
        // Add delay between requests to avoid rate limiting
        await delay();
    }

    return results;
}

// save result to CSV
async function saveResults(results) {
    let csv = `Message Length,Gas Used,Cost (${tokenDenom})\n`;

    for (const result of results.lengthResults) {
        csv += `${result.length},${result.gasUsed},${result.fee}\n`;
    }

    for (const result of results.formatResults) {
        csv += `${result.format} (${result.length}),${result.gasUsed},${result.fee}\n`;
    }

    for (const result of results.charResults) {
        csv += `'${result.character}',${result.gasUsed},${result.fee}\n`;
    }

    fs.writeFileSync(config.OUTPUT_FILE, csv);
    console.log(`\nResults saved to ${config.OUTPUT_FILE}`);
}

// run tests
async function runGasTests() {
    try {
        let client, contractAddress, signer;

        const clientData = await createClientAndWallet();
        client = clientData.client;
        signer = clientData.signer;

        if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS.trim() !== '') {
            console.log(`Using existing contract from .env: ${process.env.CONTRACT_ADDRESS}`);
            contractAddress = process.env.CONTRACT_ADDRESS;
        } else if (config.CONTRACT_ADDRESS && config.CONTRACT_ADDRESS.trim() !== '') {
            console.log(`Using existing contract from config: ${config.CONTRACT_ADDRESS}`);
            contractAddress = config.CONTRACT_ADDRESS;
        } else {
            console.log('No contract address provided. Deploying a new contract...');
            const deployResult = await deployGasTestContract();
            contractAddress = deployResult.contractAddress;
        }

        console.log(`Starting gas tests on contract: ${contractAddress}`);

        const charResults = await testSingleCharacters(client, contractAddress, signer);
        const lengthResults = await testMessageLengths(client, contractAddress, signer);
        const formatResults = await testMessageFormats(client, contractAddress, signer);

        await saveResults({ charResults, lengthResults, formatResults });

    } catch (error) {
        console.error('Error during gas testing:', error);
        process.exit(1);
    }
}

runGasTests();