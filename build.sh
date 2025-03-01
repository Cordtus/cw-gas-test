#!/bin/bash
set -e

# Builds the contract in release mode using rust-optimizer
# Requires Docker to be installed

echo "Building gas-test contract..."
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.14.0

echo "Build completed successfully! The optimized wasm file is in the artifacts directory."