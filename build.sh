#!/bin/bash
set -e

# build.sh
#  - Minimal script to compile & optimize the CosmWasm contract using Docker.
#  - Make this executable: chmod +x build.sh
#  - Usage: ./build.sh

if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed or not in PATH."
  exit 1
fi

echo "Building and optimizing contract with cosmwasm/rust-optimizer:0.14.0..."

docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.14.0

echo "Build completed successfully!"
echo "Optimized .wasm is in the 'artifacts/' directory."
