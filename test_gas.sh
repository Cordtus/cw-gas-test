#!/bin/bash

# Configuration - replace with your values
export homeDir="$HOME/.babylond"
export chainId="bbn-test-5"  # Use the appropriate chainId for the testnet
export feeToken="ubbn"
export key="test-key"        # Replace with your key name
export keyringBackend="--keyring-backend=test"
export nodeUrl="https://babylon-testnet-rpc.nodes.guru"
export apiUrl="https://babylon-testnet-api.nodes.guru"
export contractAddress="bbn1..."  # Replace with your deployed contract address

# Create output files
echo "Message Length,Gas Used,Cost (BBN)" > gas_results.csv
echo "Running gas cost tests..."

# Test single characters
echo "Testing single characters..."
for char in "a" "b" "c" "1" "2" "#" "@" "中" "😀"; do
  echo "Testing character: '$char'"
  
  output=$(babylond tx wasm execute $contractAddress \
    "{\"store_message\":{\"content\":\"$char\"}}" \
    --from="$key" \
    --gas=auto \
    --gas-prices=0.002$feeToken \
    --gas-adjustment=1.3 \
    --chain-id="$chainId" \
    -b=block \
    --yes \
    $keyringBackend \
    --home=$homeDir \
    --node=$nodeUrl \
    -o json)
  
  # Extract gas and fee information
  gas_used=$(echo $output | jq -r '.gas_used')
  gas_wanted=$(echo $output | jq -r '.gas_wanted')
  fee=$(echo "scale=6; $gas_used * 0.002 / 1000000" | bc)
  
  echo "Character: '$char', Length: 1, Gas used: $gas_used, Fee: $fee BBN"
  echo "1,$gas_used,$fee" >> gas_results.csv
  
  # Sleep to avoid rate limiting
  sleep 3
done

# Test varying message lengths
test_lengths=(5 10 20 50 100 200 500 1000 2000 5000)

for length in "${test_lengths[@]}"; do
  # Create a message of the specified length
  message=$(printf '%*s' "$length" | tr ' ' 'a')
  
  echo "Testing fixed length: $length bytes"
  
  output=$(babylond tx wasm execute $contractAddress \
    "{\"store_fixed_length_message\":{\"content\":\"$message\",\"target_length\":$length}}" \
    --from="$key" \
    --gas=auto \
    --gas-prices=0.002$feeToken \
    --gas-adjustment=1.3 \
    --chain-id="$chainId" \
    -b=block \
    --yes \
    $keyringBackend \
    --home=$homeDir \
    --node=$nodeUrl \
    -o json)
  
  # Extract gas and fee information
  gas_used=$(echo $output | jq -r '.gas_used')
  gas_wanted=$(echo $output | jq -r '.gas_wanted')
  fee=$(echo "scale=6; $gas_used * 0.002 / 1000000" | bc)
  
  echo "Length: $length, Gas used: $gas_used, Fee: $fee BBN"
  echo "$length,$gas_used,$fee" >> gas_results.csv
  
  # Sleep to avoid rate limiting
  sleep 3
done

# Test different message formats
echo "Testing different message formats..."

# JSON
json_message='{"name":"Test","values":[1,2,3],"active":true}'
json_length=${#json_message}

output=$(babylond tx wasm execute $contractAddress \
  "{\"store_message\":{\"content\":\"$json_message\"}}" \
  --from="$key" \
  --gas=auto \
  --gas-prices=0.002$feeToken \
  --gas-adjustment=1.3 \
  --chain-id="$chainId" \
  -b=block \
  --yes \
  $keyringBackend \
  --home=$homeDir \
  --node=$nodeUrl \
  -o json)

gas_used=$(echo $output | jq -r '.gas_used')
fee=$(echo "scale=6; $gas_used * 0.002 / 1000000" | bc)
echo "Format: JSON, Length: $json_length, Gas used: $gas_used, Fee: $fee BBN"
echo "JSON ($json_length),$gas_used,$fee" >> gas_results.csv
sleep 3

# Base64
base64_message=$(echo "This is a test message for Base64 encoding" | base64)
base64_length=${#base64_message}

output=$(babylond tx wasm execute $contractAddress \
  "{\"store_message\":{\"content\":\"$base64_message\"}}" \
  --from="$key" \
  --gas=auto \
  --gas-prices=0.002$feeToken \
  --gas-adjustment=1.3 \
  --chain-id="$chainId" \
  -b=block \
  --yes \
  $keyringBackend \
  --home=$homeDir \
  --node=$nodeUrl \
  -o json)

gas_used=$(echo $output | jq -r '.gas_used')
fee=$(echo "scale=6; $gas_used * 0.002 / 1000000" | bc)
echo "Format: Base64, Length: $base64_length, Gas used: $gas_used, Fee: $fee BBN"
echo "Base64 ($base64_length),$gas_used,$fee" >> gas_results.csv
sleep 3

# Hex
hex_message=$(echo "This is a test message for Hex encoding" | xxd -p | tr -d '\n')
hex_length=${#hex_message}

output=$(babylond tx wasm execute $contractAddress \
  "{\"store_message\":{\"content\":\"$hex_message\"}}" \
  --from="$key" \
  --gas=auto \
  --gas-prices=0.002$feeToken \
  --gas-adjustment=1.3 \
  --chain-id="$chainId" \
  -b=block \
  --yes \
  $keyringBackend \
  --home=$homeDir \
  --node=$nodeUrl \
  -o json)

gas_used=$(echo $output | jq -r '.gas_used')
fee=$(echo "scale=6; $gas_used * 0.002 / 1000000" | bc)
echo "Format: Hex, Length: $hex_length, Gas used: $gas_used, Fee: $fee BBN"
echo "Hex ($hex_length),$gas_used,$fee" >> gas_results.csv

echo "Tests completed. Results saved to gas_results.csv"