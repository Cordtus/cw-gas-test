// analyze-results.js

import * as fs from 'fs';
import { linearRegression } from 'simple-statistics';
import { config } from './config.js';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CW Gas Test Analysis Tool
 * 
 * Performs statistical analysis on gas test results and generates reports
 * for understanding gas costs on CosmWasm-enabled blockchains.
 */

// Constants from config
const tokenName = config.TOKEN_NAME;
const tokenDenom = config.TOKEN_DENOM;

// Parse gas price for fee calculation
const gasPrice = parseFloat(config.GAS_PRICE.replace(/[^0.9.]/g, ''));

// Caching for regression calculations
const regressionCache = {
    full: null,
    small: null,
    large: null
};

/**
 * Parse CSV data
 * @param {string} filePath - path to CSV file
 * @returns {Array} - parsed data
 */
function parseCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',');
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length !== headers.length) {
                console.warn(`Warning: Line ${i+1} has ${values.length} values, expected ${headers.length}`);
                continue;
            }
            
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
    } catch (error) {
        console.error(`Error parsing CSV: ${error.message}`);
        throw error;
    }
}

/**
 * Extract numeric data for regression analysis
 * @param {Array} data - input data
 * @returns {Array} - numeric data
 */
function extractNumericData(data) {
    // Filter for rows where Message Length is a number or can be converted to one
    return data.filter(row => {
        const lengthValue = row['Message Length'];
        
        // If it's already a number
        if (typeof lengthValue === 'number') {
            return true;
        }
        
        // If it's a string that can be converted to a number
        if (typeof lengthValue === 'string') {
            const numValue = parseInt(lengthValue, 10);
            return !isNaN(numValue);
        }
        
        return false;
    }).map(row => {
        // Ensure values are numeric
        const length = typeof row['Message Length'] === 'number' ? 
            row['Message Length'] : parseInt(row['Message Length'], 10);
            
        return {
            ...row,
            'Message Length': length
        };
    }).sort((a, b) => a['Message Length'] - b['Message Length']);
}

/**
 * Calculate regression with caching
 * @param {Array} numericData - data for regression
 * @param {string} cacheKey - key for caching
 * @returns {Object} - regression results
 */
function calculateRegression(numericData, cacheKey = 'full') {
    // Check cache first
    if (regressionCache[cacheKey]) {
        return regressionCache[cacheKey];
    }
    
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
    
    // Final result with complete statistics
    const regressionResult = {
        slope: result.m,
        intercept: result.b,
        r2: rSquared,
        points, // Include original points
        predicted: points.map(point => ({
            x: point[0],
            y: point[1],
            predicted: result.m * point[0] + result.b,
            residual: point[1] - (result.m * point[0] + result.b)
        })),
        mean,
        totalSS,
        residualSS
    };
    
    // Cache the result
    regressionCache[cacheKey] = regressionResult;
    
    return regressionResult;
}

/**
 * Calculate fee from gas units
 * @param {number} gasUnits - gas units
 * @returns {string} - fee with precision
 */
function calculateFee(gasUnits) {
    return (gasUnits * gasPrice).toFixed(6);
}

/**
 * Create client for blockchain connection
 * @returns {Promise<Object>} - client or null if failed
 */
async function createClient() {
    try {
        // Skip if no contract address is provided
        if (!config.CONTRACT_ADDRESS) {
            return null;
        }
        
        // Check if mnemonic is available
        if (!process.env.MNEMONIC) {
            console.log('No mnemonic in .env - skipping on-chain analysis');
            return null;
        }
        
        // Generate wallet from mnemonic
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
            prefix: config.ADDRESS_PREFIX,
        });
        
        // Create client
        const client = await SigningCosmWasmClient.connectWithSigner(
            config.RPC_ENDPOINT,
            wallet,
            {
                gasPrice: GasPrice.fromString(config.GAS_PRICE),
            }
        );
        
        return client;
    } catch (error) {
        console.error('Error creating client:', error.message);
        return null;
    }
}

/**
 * Query gas summary from contract
 * @param {Object} client - client instance
 * @returns {Promise<Object>} - gas summary or null if failed
 */
async function queryContractSummary(client) {
    try {
        if (!client) return null;
        
        const summary = await client.queryContractSmart(config.CONTRACT_ADDRESS, { get_gas_summary: {} });
        return summary;
    } catch (error) {
        console.error('Error querying contract:', error.message);
        return null;
    }
}

/**
 * Generate HTML visualization
 * @param {Object} regression - regression results
 * @param {Array} data - CSV data
 * @returns {string} - HTML content
 */
function generateVisualizationHTML(regression, data) {
    // Extract data for the chart
    const lengthData = data.filter(row => {
        const lengthValue = row['Message Length'];
        return typeof lengthValue === 'number';
    }).map(row => ({
        length: row['Message Length'],
        gas: row['Gas Used']
    }));
    
    // Format data for D3.js
    const chartData = JSON.stringify(lengthData);
    
    // Generate regression line points
    const minLength = Math.min(...lengthData.map(d => d.length));
    const maxLength = Math.max(...lengthData.map(d => d.length));
    
    const regressionPoints = [
        { length: minLength, gas: regression.intercept + regression.slope * minLength },
        { length: maxLength, gas: regression.intercept + regression.slope * maxLength }
    ];
    
    // Create HTML template with embedded D3.js visualization
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CW Gas Cost Analysis</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2 {
            color: #333;
        }
        .chart-container {
            width: 100%;
            height: 500px;
            margin: 20px 0;
            border: 1px solid #ddd;
            padding: 20px;
            box-sizing: border-box;
            position: relative;
        }
        .tooltip {
            position: absolute;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px;
            border-radius: 5px;
            pointer-events: none;
            opacity: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
        .formula {
            background-color: #f9f9f9;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h1>CW Gas Cost Analysis</h1>
    
    <h2>Chain Details</h2>
    <table>
        <tr>
            <th>Property</th>
            <th>Value</th>
        </tr>
        <tr>
            <td>Chain ID</td>
            <td>${config.CHAIN_ID}</td>
        </tr>
        <tr>
            <td>Gas Price</td>
            <td>${config.GAS_PRICE}</td>
        </tr>
    </table>
    
    <h2>Gas Usage Visualization</h2>
    <div class="chart-container" id="gas-chart">
        <div class="tooltip" id="tooltip"></div>
    </div>
    
    <h2>Regression Analysis</h2>
    <table>
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
        <tr>
            <td>Base gas cost</td>
            <td>${regression.intercept.toFixed(2)} gas units</td>
        </tr>
        <tr>
            <td>Marginal cost per byte</td>
            <td>${regression.slope.toFixed(2)} gas units</td>
        </tr>
        <tr>
            <td>R-squared</td>
            <td>${regression.r2.toFixed(4)}</td>
        </tr>
    </table>
    
    <h2>Cost in ${tokenName} (${tokenDenom})</h2>
    <table>
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
        <tr>
            <td>Base cost</td>
            <td>${calculateFee(regression.intercept)} ${tokenDenom}</td>
        </tr>
        <tr>
            <td>Marginal cost per byte</td>
            <td>${calculateFee(regression.slope)} ${tokenDenom}</td>
        </tr>
    </table>
    
    <h2>Formula</h2>
    <div class="formula">
        <p>Total Gas = ${regression.intercept.toFixed(2)} + ${regression.slope.toFixed(2)} × Message Size (bytes)</p>
        <p>Total Cost = Total Gas × ${gasPrice} ${tokenDenom}/gas unit</p>
    </div>
    
    <script>
        // Data for the chart
        const chartData = ${chartData};
        const regressionLine = ${JSON.stringify(regressionPoints)};
        
        // Create the chart
        function createChart() {
            const margin = {top: 20, right: 30, bottom: 40, left: 60};
            const width = document.getElementById('gas-chart').clientWidth - margin.left - margin.right;
            const height = document.getElementById('gas-chart').clientHeight - margin.top - margin.bottom;
            
            // Create the SVG element
            const svg = d3.select('#gas-chart')
                .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
            
            // Create scales
            const x = d3.scaleLinear()
                .domain([0, d3.max(chartData, d => d.length) * 1.1])
                .range([0, width]);
            
            const y = d3.scaleLinear()
                .domain([0, d3.max(chartData, d => d.gas) * 1.1])
                .range([height, 0]);
            
            // Create axes
            svg.append('g')
                .attr('transform', 'translate(0,' + height + ')')
                .call(d3.axisBottom(x))
                .append('text')
                .attr('x', width / 2)
                .attr('y', 35)
                .attr('fill', '#000')
                .style('text-anchor', 'middle')
                .text('Message Length (bytes)');
            
            svg.append('g')
                .call(d3.axisLeft(y))
                .append('text')
                .attr('transform', 'rotate(-90)')
                .attr('y', -45)
                .attr('x', -height / 2)
                .attr('fill', '#000')
                .style('text-anchor', 'middle')
                .text('Gas Used');
            
            // Add regression line
            svg.append('path')
                .datum(regressionLine)
                .attr('fill', 'none')
                .attr('stroke', 'red')
                .attr('stroke-width', 2)
                .attr('d', d3.line()
                    .x(d => x(d.length))
                    .y(d => y(d.gas))
                );
            
            // Add data points
            svg.selectAll('circle')
                .data(chartData)
                .enter()
                .append('circle')
                .attr('cx', d => x(d.length))
                .attr('cy', d => y(d.gas))
                .attr('r', 5)
                .attr('fill', 'steelblue')
                .attr('stroke', '#fff')
                .attr('stroke-width', 1);
            
            // Set up tooltip
            const tooltip = d3.select('#tooltip');
            
            // Add hover tooltips
            svg.selectAll('circle')
                .on('mouseover', function(event, d) {
                    d3.select(this).attr('r', 7);
                    tooltip
                        .style('opacity', 0.9)
                        .style('left', (event.pageX - document.getElementById('gas-chart').getBoundingClientRect().left + 10) + 'px')
                        .style('top', (event.pageY - document.getElementById('gas-chart').getBoundingClientRect().top - 28) + 'px')
                        .html('Length: ' + d.length + '<br>Gas: ' + d.gas);
                })
                .on('mouseout', function() {
                    d3.select(this).attr('r', 5);
                    tooltip.style('opacity', 0);
                });
        }
        
        // Call the function when window loads
        window.onload = createChart;
    </script>
</body>
</html>`;
}

/**
 * Analyze gas results
 * @returns {Promise<void>}
 */
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
        
        if (numericData.length < 2) {
            console.error('Not enough numeric data points for regression analysis');
            return;
        }
        
        // Calculate regression for all data
        const regression = calculateRegression(numericData, 'full');
        
        // Calculate regression for small messages (≤200 bytes)
        const smallData = numericData.filter(row => row['Message Length'] <= 200);
        let smallRegression = null;
        if (smallData.length >= 2) {
            smallRegression = calculateRegression(smallData, 'small');
        }
        
        // Calculate regression for large messages (>200 bytes)
        const largeData = numericData.filter(row => row['Message Length'] > 200);
        let largeRegression = null;
        if (largeData.length >= 2) {
            largeRegression = calculateRegression(largeData, 'large');
        }
        
        console.log('\nGas Regression Analysis:');
        console.log(`Base gas cost: ${regression.intercept.toFixed(2)} gas units`);
        console.log(`Marginal cost per byte: ${regression.slope.toFixed(2)} gas units`);
        console.log(`R-squared: ${regression.r2.toFixed(4)}`);
        
        if (smallRegression) {
            console.log('\nSmall Message Analysis (≤200 bytes):');
            console.log(`Base gas cost: ${smallRegression.intercept.toFixed(2)} gas units`);
            console.log(`Marginal cost per byte: ${smallRegression.slope.toFixed(2)} gas units`);
            console.log(`R-squared: ${smallRegression.r2.toFixed(4)}`);
        }
        
        if (largeRegression) {
            console.log('\nLarge Message Analysis (>200 bytes):');
            console.log(`Base gas cost: ${largeRegression.intercept.toFixed(2)} gas units`);
            console.log(`Marginal cost per byte: ${largeRegression.slope.toFixed(2)} gas units`);
            console.log(`R-squared: ${largeRegression.r2.toFixed(4)}`);
        }
        
        // Cost in native tokens
        const baseCostToken = calculateFee(regression.intercept);
        const marginalCostToken = calculateFee(regression.slope);
        
        console.log('\nCost Analysis:');
        console.log(`Base cost: ${baseCostToken} ${tokenDenom}`);
        console.log(`Marginal cost per byte: ${marginalCostToken} ${tokenDenom}`);
        
        // Query chain data
        const client = await createClient();
        const onChainSummary = await queryContractSummary(client);
        
        // Provide some practical estimates
        console.log('\nPractical Estimates:');
        const sizes = [10, 100, 1000, 10000];
        
        for (const size of sizes) {
            const gasEstimate = regression.intercept + regression.slope * size;
            const costEstimate = calculateFee(gasEstimate);
            console.log(`${size} bytes: ~${gasEstimate.toFixed(0)} gas (${costEstimate} ${tokenDenom})`);
        }
        
        // Generate summary file
        let summary = `# CW Gas Cost Analysis

## Chain Details
- Chain ID: ${config.CHAIN_ID}
- Gas Price: ${config.GAS_PRICE}

## Regression Analysis
- Base gas cost: ${regression.intercept.toFixed(2)} gas units
- Marginal cost per byte: ${regression.slope.toFixed(2)} gas units
- R-squared: ${regression.r2.toFixed(4)}`;

        if (smallRegression) {
            summary += `

## Small Message Analysis (≤200 bytes)
- Base gas cost: ${smallRegression.intercept.toFixed(2)} gas units
- Marginal cost per byte: ${smallRegression.slope.toFixed(2)} gas units
- R-squared: ${smallRegression.r2.toFixed(4)}`;
        }

        if (largeRegression) {
            summary += `

## Large Message Analysis (>200 bytes)
- Base gas cost: ${largeRegression.intercept.toFixed(2)} gas units
- Marginal cost per byte: ${largeRegression.slope.toFixed(2)} gas units
- R-squared: ${largeRegression.r2.toFixed(4)}`;
        }

        summary += `

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
`;

        // Add on-chain data [if exists]
        if (onChainSummary) {
            summary += `
## On-Chain Gas Summary
- Total Messages: ${onChainSummary.msg_count}
- Total Gas Used: ${onChainSummary.total_gas}
- Average Gas Per Message: ${onChainSummary.avg_gas}
- Total Bytes Processed: ${onChainSummary.total_bytes}
- Average Gas Per Byte: ${onChainSummary.gas_per_byte}
`;
        }

        summary += `\nAnalysis conducted on ${new Date().toISOString().split('T')[0]}`;

        fs.writeFileSync('gas_analysis.md', summary);
        console.log('Summary saved as gas_analysis.md');
        
        // Generate HTML visualization
        const htmlVisualization = generateVisualizationHTML(regression, data);
        fs.writeFileSync('gas_visualization.html', htmlVisualization);
        console.log('Interactive visualization saved as gas_visualization.html');
        
        // Check for special format data
        const formatData = data.filter(row => {
            const lengthValue = row['Message Length'];
            return typeof lengthValue === 'string' && lengthValue.includes('(');
        });
        
        if (formatData.length > 0) {
            console.log('\nSpecial Format Analysis:');
            console.log('Format,Length,Gas Used,Cost');
            for (const row of formatData) {
                const costColumn = `Cost (${tokenDenom})`;
                console.log(`${row['Message Length']},${row['Gas Used']},${row[costColumn]}`);
            }
        }
        
        // Check for character data
        const charData = data.filter(row => {
            const lengthValue = row['Message Length'];
            return typeof lengthValue === 'string' && lengthValue.startsWith("'");
        });
        
        if (charData.length > 0) {
            console.log('\nCharacter Analysis:');
            console.log('Character,Gas Used,Cost');
            for (const row of charData) {
                const costColumn = `Cost (${tokenDenom})`;
                console.log(`${row['Message Length']},${row['Gas Used']},${row[costColumn]}`);
            }
        }
        
        console.log('\nAnalysis complete!');
        
    } catch (error) {
        console.error('Error analyzing results:', error);
    }
}

// Run if executed directly
if (import.meta.url.endsWith('analyze-results.js')) {
    analyzeGasResults();
}

export { analyzeGasResults };