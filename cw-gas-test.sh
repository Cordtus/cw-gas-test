#!/bin/bash
set -e

# -----------------------------------------------------
# cw-gas-test.sh
#   - Combined workflow from the old setup.sh + run-test.sh
#   - Usage: ./cw-gas-test.sh
#
# It will:
#   1) Check chain config & existing deployments
#   2) Build the contract if needed (calls build.sh)
#   3) Install JS dependencies
#   4) Check .env for mnemonic
#   5) Deploy if no existing contract is set
#   6) Run test script
#   7) Run analysis
# -----------------------------------------------------

# Paths
SCRIPT_DIR=$(dirname "$(realpath "$0")")
SCRIPTS_DIR="$SCRIPT_DIR/scripts"
ARTIFACTS_DIR="$SCRIPT_DIR/artifacts"

CONFIG_FILE="$SCRIPTS_DIR/config.js"
DEPLOYMENTS_FILE="$SCRIPTS_DIR/deployments.json"
ENV_FILE="$SCRIPTS_DIR/.env"
ENV_TEMPLATE="$SCRIPTS_DIR/.env.template"
RESULTS_FILE="$SCRIPTS_DIR/gas_results.csv"
ANALYSIS_FILE="$SCRIPTS_DIR/gas_analysis.md"

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}Error: $1 is not installed or not in PATH.${NC}"
    exit 1
  fi
}

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   CW Gas Test - Combined Automated Workflow    ${NC}"
echo -e "${BLUE}================================================${NC}"

# 1) Check basic requirements
check_command "jq"
check_command "docker"
check_command "node"

# 2) Determine CHAIN_ID from config.js
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}ERROR: config.js not found at $CONFIG_FILE${NC}"
  exit 1
fi

CHAIN_ID=$(grep -o "CHAIN_ID:.*" "$CONFIG_FILE" | head -1 | cut -d "'" -f 2)
if [ -z "$CHAIN_ID" ]; then
  echo -e "${RED}ERROR: Could not determine CHAIN_ID from $CONFIG_FILE${NC}"
  echo -e "${YELLOW}Check config.js and ensure CHAIN_ID is properly set.${NC}"
  exit 1
fi
echo -e "Target chain: ${BLUE}$CHAIN_ID${NC}"

# 3) Check deployments.json for an existing contract
CONTRACT_ADDRESS=$(grep -o "CONTRACT_ADDRESS:.*" "$CONFIG_FILE" | head -1 | cut -d "'" -f 2)
FOUND_IN_DEPLOYMENTS=""

if [ -f "$DEPLOYMENTS_FILE" ]; then
  DEPLOYMENT_ADDRESS=$(jq -r ".deployments[] | select(has(\"$CHAIN_ID\")) | .[\"$CHAIN_ID\"]" "$DEPLOYMENTS_FILE")
  if [ -n "$DEPLOYMENT_ADDRESS" ] && [ "$DEPLOYMENT_ADDRESS" != "placeholder" ] && [ "$DEPLOYMENT_ADDRESS" != "null" ]; then
    FOUND_IN_DEPLOYMENTS="$DEPLOYMENT_ADDRESS"
    echo -e "Found existing deployment for chain ${BLUE}$CHAIN_ID${NC}: ${GREEN}$DEPLOYMENT_ADDRESS${NC}"
    # If config.js's CONTRACT_ADDRESS is empty, fill it
    if [ -z "$CONTRACT_ADDRESS" ] || [ "$CONTRACT_ADDRESS" = "" ]; then
      echo -e "${YELLOW}Updating config.js with existing contract address...${NC}"
      sed -i "s/CONTRACT_ADDRESS: '[^']*'/CONTRACT_ADDRESS: '$DEPLOYMENT_ADDRESS'/" "$CONFIG_FILE"
      CONTRACT_ADDRESS="$DEPLOYMENT_ADDRESS"
    elif [ "$CONTRACT_ADDRESS" != "$DEPLOYMENT_ADDRESS" ]; then
      echo -e "${YELLOW}WARNING: config.js has CONTRACT_ADDRESS=$CONTRACT_ADDRESS; deployments.json has $DEPLOYMENT_ADDRESS${NC}"
      echo -e "They differ, but we'll keep the address in config.js unless you change it manually."
    fi
  else
    echo -e "No valid deployment found in deployments.json for chain ID: $CHAIN_ID"
  fi
else
  echo -e "${YELLOW}No deployments.json found at $DEPLOYMENTS_FILE. Skipping existing-contract check.${NC}"
fi

# 4) If no contract address was set, we know we'll need to build & deploy.
NEED_BUILD_AND_DEPLOY=false
if [ -z "$CONTRACT_ADDRESS" ] || [ "$CONTRACT_ADDRESS" = "" ]; then
  NEED_BUILD_AND_DEPLOY=true
  echo -e "${YELLOW}We have no CONTRACT_ADDRESS in config.js. We'll build and deploy a new contract...${NC}"
fi

# 5) Build the contract (if needed)
if [ ! -f "$ARTIFACTS_DIR/cw_gas_test.wasm" ] || [ "$NEED_BUILD_AND_DEPLOY" = true ]; then
  echo -e "\n${GREEN}Step: Building contract (using build.sh) ...${NC}"
  if [ ! -f "$SCRIPT_DIR/build.sh" ]; then
    echo -e "${RED}ERROR: 'build.sh' not found in $SCRIPT_DIR. Cannot build contract.${NC}"
    exit 1
  fi
  (cd "$SCRIPT_DIR" && ./build.sh)
else
  echo -e "\n${GREEN}Contract artifact found in artifacts/. Skipping build step.${NC}"
fi

# 6) Install JS dependencies
echo -e "\n${GREEN}Step: Installing/Checking Node.js dependencies...${NC}"
if [ ! -d "$SCRIPTS_DIR/node_modules" ]; then
  echo -e "${YELLOW}No node_modules in $SCRIPTS_DIR. Installing now...${NC}"
  (cd "$SCRIPTS_DIR" && [ -f yarn.lock ] && yarn install || npm install)
else
  echo -e "${GREEN}Node.js dependencies already installed in $SCRIPTS_DIR${NC}"
fi

# 7) Check .env for mnemonic
echo -e "\n${GREEN}Step: Checking for .env and mnemonic...${NC}"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_TEMPLATE" ]; then
    echo -e "${YELLOW}Copying .env.template to .env${NC}"
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    echo -e "${RED}WARNING: You must edit $ENV_FILE and add your mnemonic!${NC}"
  else
    echo -e "${YELLOW}Creating a blank .env file${NC}"
    echo 'MNEMONIC=""' > "$ENV_FILE"
    echo -e "${RED}WARNING: You must edit $ENV_FILE to add your mnemonic!${NC}"
  fi
fi

MNEMONIC=$(grep -o 'MNEMONIC="[^"]*"' "$ENV_FILE" | cut -d '"' -f 2)
if [ -z "$MNEMONIC" ]; then
  echo -e "${RED}ERROR: No mnemonic found in $ENV_FILE${NC}"
  echo -e "${YELLOW}Please edit $ENV_FILE and add your 24-word mnemonic.${NC}"
  exit 1
fi

# 8) Deploy if needed
echo -e "\n${GREEN}Step: Checking if we should deploy the contract...${NC}"
if [ "$NEED_BUILD_AND_DEPLOY" = true ]; then
  echo -e "${YELLOW}Deploying a new contract...${NC}"
  (cd "$SCRIPTS_DIR" && node deploy.js)

  # Re-check config.js for the newly set address
  CONTRACT_ADDRESS=$(grep -o "CONTRACT_ADDRESS:.*" "$CONFIG_FILE" | head -1 | cut -d "'" -f 2)
  if [ -z "$CONTRACT_ADDRESS" ] || [ "$CONTRACT_ADDRESS" = "" ]; then
    echo -e "${RED}ERROR: Deployment did not update CONTRACT_ADDRESS in config.js${NC}"
    exit 1
  fi
  echo -e "${GREEN}Deployed new contract at: $CONTRACT_ADDRESS${NC}"
else
  echo -e "${GREEN}Using existing contract address: ${BLUE}$CONTRACT_ADDRESS${NC}"
fi

# 9) Run gas tests
echo -e "\n${GREEN}Step: Running gas tests...${NC}"
(
  cd "$SCRIPTS_DIR"
  echo -e "${YELLOW}Executing test-gas.js...${NC}"
  node test-gas.js
)

# 10) Analyze results
echo -e "\n${GREEN}Step: Analyzing test results...${NC}"
if [ -f "$RESULTS_FILE" ]; then
  echo -e "${YELLOW}Running JS analysis (analyze-results.js)...${NC}"
  (cd "$SCRIPTS_DIR" && node analyze-results.js)

  # Optionally run Python analysis if found
  if [ -f "$SCRIPT_DIR/analyze_results.py" ]; then
    echo -e "${YELLOW}Found analyze_results.py. Attempting Python analysis...${NC}"
    if command -v python3 &> /dev/null; then
      if command -v pip3 &> /dev/null; then
        if ! python3 -c "import pandas; import matplotlib; import scipy" &> /dev/null; then
          echo -e "${YELLOW}Installing required Python packages (pandas, matplotlib, scipy)...${NC}"
          pip3 install pandas matplotlib scipy
        fi
        (cd "$SCRIPT_DIR" && python3 analyze_results.py)
      else
        echo -e "${YELLOW}pip3 not found. Skipping Python analysis.${NC}"
      fi
    else
      echo -e "${YELLOW}python3 not found. Skipping Python analysis.${NC}"
    fi
  fi

  if [ -f "$ANALYSIS_FILE" ]; then
    echo -e "${GREEN}Analysis report generated: $ANALYSIS_FILE${NC}"
  fi
  if [ -f "$SCRIPT_DIR/gas_analysis.png" ]; then
    echo -e "${GREEN}Visualization generated: gas_analysis.png${NC}"
  fi
else
  echo -e "${RED}ERROR: No results file at $RESULTS_FILE. Test might have failed.${NC}"
  exit 1
fi

echo -e "\n${BLUE}================================================${NC}"
echo -e "${GREEN}All steps completed successfully!${NC}"
echo -e "${BLUE}================================================${NC}"
