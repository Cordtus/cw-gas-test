import * as fs from 'fs';
import * as d3 from 'd3';
import { createCanvas } from 'canvas';
import { config } from './config.js';

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
    });
}

// Perform linear regression
function linearRegression(data, xKey, yKey) {
    const n = data.length;
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    
    for (const row of data) {
        const x = row[xKey];
        const y = row[yKey];
        
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const meanY = sumY / n;
    let totalSS = 0;
    let residualSS = 0;
    
    for (const row of data) {
        const x = row[xKey];
        const y = row[yKey];
        const prediction = intercept + slope * x;
        
        totalSS += (y - meanY) ** 2;
        residualSS += (y - prediction) ** 2;
    }
    
    const rSquared = 1 - (residualSS / totalSS);
    
    return { slope, intercept, rSquared };
}

// Main analysis function
function analyzeGasResults() {
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
        
        // Perform regression
        const regression = linearRegression(numericData, 'Message Length', 'Gas Used');
        
        console.log('\nGas Regression Analysis:');
        console.log(`Base gas cost: ${regression.intercept.toFixed(2)} gas units`);
        console.log(`Marginal cost per byte: ${regression.slope.toFixed(2)} gas units`);
        console.log(`R-squared: ${regression.rSquared.toFixed(4)}`);
        
        // Calculate cost in BBN tokens
        const baseCostBBN = (regression.intercept * 0.002) / 1000000;
        const marginalCostBBN = (regression.slope * 0.002) / 1000000;
        
        console.log('\nCost Analysis:');
        console.log(`Base cost: ${baseCostBBN.toFixed(6)} BBN`);
        console.log(`Marginal cost per byte: ${marginalCostBBN.toFixed(8)} BBN`);
        
        // Provide some practical estimates
        console.log('\nPractical Estimates:');
        const sizes = [10, 100, 1000, 10000];
        
        for (const size of sizes) {
            const gasEstimate = regression.intercept + regression.slope * size;
            const costEstimate = (gasEstimate * 0.002) / 1000000;
            console.log(`${size} bytes: ~${gasEstimate.toFixed(0)} gas (${costEstimate.toFixed(6)} BBN)`);
        }
        
        // Check for special format data
        const formatData = data.filter(row => {
            const lengthValue = row['Message Length'];
            return typeof lengthValue === 'string' && lengthValue.includes('(');
        });
        
        if (formatData.length > 0) {
            console.log('\nSpecial Format Analysis:');
            for (const row of formatData) {
                console.log(`${row['Message Length']}: ${row['Gas Used']} gas (${row['Cost (BBN)']} BBN)`);
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
                console.log(`${row['Message Length']}: ${row['Gas Used']} gas (${row['Cost (BBN)']} BBN)`);
            }
        }
        
    } catch (error) {
        console.error('Error analyzing results:', error);
    }
}

analyzeGasResults();