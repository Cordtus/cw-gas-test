// analyze-results.js

import * as fs from 'fs';
import { linearRegression } from 'simple-statistics';
import { config } from './config.js';

const tokenName = config.TOKEN_NAME;
const tokenDenom = config.TOKEN_DENOM;

// parse gas price for fee calculation
const gasPrice = parseFloat(config.GAS_PRICE.replace(/[^0-9.]/g, ''));

// Function to parse CSV
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        
        for (let j = 0; j < headers.length; j++) {
            const value = values[j];
            // Try to parse as number if possible
            const numValue = parseFloat(value);
            row[headers[j]] = isNaN(numValue) ? value : numValue;
        }
        
        data.push(row);
    }
    
    return data;
}

// Function to extract numeric data
function extractNumericData(data) {
    return data.filter(row => {
        const lengthValue = row['Message Length'];
        return typeof lengthValue === 'number';
    }).sort((a, b) => a['Message Length'] - b['Message Length']);
}

// Function to calculate regression
function calculateRegression(numericData) {
    // Prepare data for regression
    const points = numericData.map(row => [row['Message Length'], row['Gas Used']]);
    
    // Calculate regression
    const result = linearRegression(points);
    
    // Calculate R-squared
    const mean = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const totalSS = points.reduce((sum, point) => sum + Math.pow(point[1] - mean, 2), 0);
    const residualSS = points.reduce((sum, point) => {
        const predicted = result.m * point[0] + result.b;
        return sum + Math.pow(point[1] - predicted, 2);
    }, 0);
    const rSquared = 1 - (residualSS / totalSS);
    
    return {
        slope: result.m,
        intercept: result.b,
        r2: rSquared
    };
}

// fee in micro-units
function calculateFee(gasUnits) {
    return (gasUnits * gasPrice).toFixed(6);
}

// Main analysis function
async function analyzeGasResults() {
    try {
        console.log('Analyzing gas results...');
        
        // Check if results file exists
        if (!fs.existsSync(config.OUTPUT_FILE)) {
            console.error(`Results file ${config.OUTPUT_FILE} not found. Run test-gas.js first.`);
            return;
        }
        
        // Parse CSV data
        const data = parseCSV(config.OUTPUT_FILE);
        console.log(`Loaded ${data.length} data points from ${config.OUTPUT_FILE}`);
        
        // Get numeric data for regression
        const numericData = extractNumericData(data);
        console.log(`Found ${numericData.length} numeric data points for regression analysis`);
        
        // Calculate regression
        const regression = calculateRegression(numericData);
        
        console.log('\nGas Regression Analysis:');
        console.log(`Base gas cost: ${regression.intercept.toFixed(2)} gas units`);
        console.log(`Marginal cost per byte: ${regression.slope.toFixed(2)} gas units`);
        console.log(`R-squared: ${regression.r2.toFixed(4)}`);
        
        // cost in native tokens
        const baseCostToken = calculateFee(regression.intercept);
        const marginalCostToken = calculateFee(regression.slope);
        
        console.log('\nCost Analysis:');
        console.log(`Base cost: ${baseCostToken} ${tokenDenom}`);
        console.log(`Marginal cost per byte: ${marginalCostToken} ${tokenDenom}`);
        
        // Provide some practical estimates
        console.log('\nPractical Estimates:');
        const sizes = [10, 100, 1000, 10000];
        
        for (const size of sizes) {
            const gasEstimate = regression.intercept + regression.slope * size;
            const costEstimate = calculateFee(gasEstimate);
            console.log(`${size} bytes: ~${gasEstimate.toFixed(0)} gas (${costEstimate} ${tokenDenom})`);
        }
        
        // Generate summary file
        const summary = `# CosmWasm Gas Cost Analysis

## Chain Details
- Chain ID: ${config.CHAIN_ID}
- Gas Price: ${config.GAS_PRICE}

## Regression Analysis
- Base gas cost: ${regression.intercept.toFixed(2)} gas units
- Marginal cost per byte: ${regression.slope.toFixed(2)} gas units
- R-squared: ${regression.r2.toFixed(4)}

## Cost in ${tokenName} (${tokenDenom})
- Base cost: ${baseCostToken} ${tokenDenom}
- Marginal cost per byte: ${marginalCostToken} ${tokenDenom}

## Practical Estimates
${sizes.map(size => {
    const gasEstimate = regression.intercept + regression.slope * size;
    const costEstimate = calculateFee(gasEstimate);
    return `- ${size} bytes: ~${gasEstimate.toFixed(0)} gas (${costEstimate} ${tokenDenom})`;
}).join('\n')}

## Formula
Total Gas = ${regression.intercept.toFixed(2)} + ${regression.slope.toFixed(2)} × Message Size (bytes)
Total Cost = Total Gas × ${gasPrice} ${tokenDenom}/gas unit

Analysis conducted on ${new Date().toISOString().split('T')[0]}
`;

        fs.writeFileSync('gas_analysis.md', summary);
        console.log('Summary saved as gas_analysis.md');
        
        // Check for special format data
        const formatData = data.filter(row => {
            const lengthValue = row['Message Length'];
            return typeof lengthValue === 'string' && lengthValue.includes('(');
        });
        
        if (formatData.length > 0) {
            console.log('\nSpecial Format Analysis:');
            for (const row of formatData) {
                const costColumn = `Cost (${tokenDenom})`;
                console.log(`${row['Message Length']}: ${row['Gas Used']} gas (${row[costColumn]} ${tokenDenom})`);
            }
        }
        
        // Check for character data
        const charData = data.filter(row => {
            const lengthValue = row['Message Length'];
            return typeof lengthValue === 'string' && lengthValue.startsWith("'");
        });
        
        if (charData.length > 0) {
            console.log('\nCharacter Analysis:');
            for (const row of charData) {
                const costColumn = `Cost (${tokenDenom})`;
                console.log(`${row['Message Length']}: ${row['Gas Used']} gas (${row[costColumn]} ${tokenDenom})`);
            }
        }
        
    } catch (error) {
        console.error('Error analyzing results:', error);
    }
}

analyzeGasResults();