use cosmwasm_std::{
  entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
  to_json_binary, Addr, Uint128, StdError,
};
use cw_storage_plus::{Bound, Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// Custom error type
#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Invalid message length: {length}, expected: {expected}")]
    InvalidMessageLength { length: u64, expected: u64 },

    #[error("Message too large: {size} bytes exceeds maximum of {max} bytes")]
    MessageTooLarge { size: u64, max: u64 },

    #[error("Invalid run ID: {0}")]
    InvalidRunId(String),

    #[error("Invalid chain ID: {0}")]
    InvalidChainId(String),

    #[error("Invalid gas value: {0}")]
    InvalidGasValue(String),
    
    #[error("No data available")]
    NoData {},
}

// Contract state
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct State {
  pub owner: Addr,
  pub test_run_count: u64,
  pub last_test_timestamp: Option<u64>, // Use u64 instead of Timestamp for storage efficiency
}

// Compact storage for messages with minimal overhead
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct StoredMessage {
  pub content: String,
  pub length: u64,
  // Only store timestamps as seconds (u64) instead of full Timestamp objects
  pub stored_at: u64,
}

// Compact storage for test run data 
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TestRunStats {
  // Use a compact timestamp format (seconds since epoch)
  pub timestamp: u64,
  pub message_count: u64, 
  pub total_gas: Uint128,
  pub avg_gas_per_byte: Uint128,
  pub chain_id: String,
  // Store tx hashes in a space-efficient format - comma separated
  pub tx_proof: Option<String>, // Optional field for tx hash proofs
}

// Initialize message (minimal required data)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
  // Only required fields
}

// Execute messages with optimized parameter names
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
  // Store a message of any length
  StoreMessage { content: String },
  
  // Store a message with a specific target length
  // If content is longer than length, it will be truncated
  // If content is shorter than length, it will be padded with spaces
  StoreFixedLength { content: String, length: u64 },
  
  // Record aggregated test run data with transaction proofs
  RecordTestRun {
      run_id: String,
      count: u64,           // message_count shortened
      gas: Uint128,         // total_gas_used shortened
      avg_gas: Uint128,     // average_gas_per_byte shortened
      chain: String,        // chain_id shortened
      tx_proof: Option<String>, // tx_hashes renamed for clarity
  },
  
  // Clear old test data (admin only)
  ClearData {},
}

// Query messages
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
  GetConfig {},
  GetMessage { id: String },
  ListMessages { 
      start_after: Option<String>,
      limit: Option<u32>,
  },
  GetTestRuns {
      start_after: Option<String>,
      limit: Option<u32>,
  },
  GetGasSummary {},
}

// Response types
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigResponse {
  pub owner: String,
  pub test_count: u64,
  pub last_test: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct MessageResponse {
  pub id: String,
  pub content: String,
  pub length: u64,
  pub time: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ListMessagesResponse {
  pub msgs: Vec<MessageResponse>,
  pub count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TestRunResponse {
  pub id: String, 
  pub time: u64,
  pub count: u64,
  pub gas: Uint128,
  pub avg_gas: Uint128,
  pub chain: String,
  pub tx_count: u32, // Number of tx proofs
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TestRunsResponse {
  pub runs: Vec<TestRunResponse>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct GasSummary {
  pub msg_count: u64,
  pub total_gas: Uint128,
  pub avg_gas: Uint128,
  pub total_bytes: u64,
  pub gas_per_byte: Uint128,
}

// Storage constants
pub const STATE: Item<State> = Item::new("state");
pub const MESSAGES: Map<&str, StoredMessage> = Map::new("msgs");
pub const TEST_RUNS: Map<&str, TestRunStats> = Map::new("runs");
pub const MAX_MESSAGE_SIZE: u64 = 10000; // Define a max msg size

#[entry_point]
pub fn instantiate(
  deps: DepsMut,
  _env: Env,
  info: MessageInfo,
  _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
  let state = State {
      owner: info.sender.clone(),
      test_run_count: 0,
      last_test_timestamp: None,
  };

  STATE.save(deps.storage, &state)?;

  Ok(Response::new()
      .add_attribute("method", "instantiate")
      .add_attribute("owner", info.sender))
}

#[entry_point]
pub fn execute(
  deps: DepsMut,
  env: Env,
  info: MessageInfo,
  msg: ExecuteMsg,
) -> Result<Response, ContractError> {
  match msg {
      ExecuteMsg::StoreMessage { content } => 
          execute_store_message(deps, env, info, content),
      ExecuteMsg::StoreFixedLength { content, length } => 
          execute_store_fixed_length(deps, env, info, content, length),
      ExecuteMsg::RecordTestRun { run_id, count, gas, avg_gas, chain, tx_proof } => 
          execute_record_test_run(deps, env, info, run_id, count, gas, avg_gas, chain, tx_proof),
      ExecuteMsg::ClearData {} => 
          execute_clear_data(deps, env, info),
  }
}

/// Store msg with actual length
pub fn execute_store_message(
  deps: DepsMut,
  env: Env,
  _info: MessageInfo,
  content: String,
) -> Result<Response, ContractError> {
  // Validate msg size
  let length = content.len() as u64;
  if length > MAX_MESSAGE_SIZE {
      return Err(ContractError::MessageTooLarge { 
          size: length, 
          max: MAX_MESSAGE_SIZE 
      });
  }

  let id = format!("msg_{}", env.block.height);

  let message = StoredMessage {
      content,
      length,
      stored_at: env.block.time.seconds(),
  };

  MESSAGES.save(deps.storage, &id, &message)?;

  Ok(Response::new()
      .add_attribute("action", "store_message")
      .add_attribute("id", id)
      .add_attribute("length", length.to_string()))
}

// Store a message with a specific target length
pub fn execute_store_fixed_length(
  deps: DepsMut,
  env: Env,
  _info: MessageInfo,
  content: String,
  target_length: u64,
) -> Result<Response, ContractError> {
  // Validate target length
  if target_length > MAX_MESSAGE_SIZE {
      return Err(ContractError::MessageTooLarge { 
          size: target_length, 
          max: MAX_MESSAGE_SIZE 
      });
  }
  
  let id = format!("msg_{}_{}", env.block.height, target_length);
  
  // Adjust content to match target length
  let adjusted_content = if content.len() as u64 > target_length {
      // Truncate if too long
      content.chars().take(target_length as usize).collect()
  } else {
      // Pad with spaces if too short
      let padding = " ".repeat((target_length as usize).saturating_sub(content.len()));
      format!("{}{}", content, padding)
  };
  
  let actual_length = adjusted_content.len() as u64;

  // Verify adjustment worked correctly
  if actual_length != target_length {
      return Err(ContractError::InvalidMessageLength { 
          length: actual_length, 
          expected: target_length 
      });
  }

  let message = StoredMessage {
      content: adjusted_content,
      length: actual_length,
      stored_at: env.block.time.seconds(),
  };

  MESSAGES.save(deps.storage, &id, &message)?;

  Ok(Response::new()
      .add_attribute("action", "store_fixed_length")
      .add_attribute("id", id)
      .add_attribute("length", actual_length.to_string()))
}

// Record test run statistics
pub fn execute_record_test_run(
  deps: DepsMut,
  env: Env,
  info: MessageInfo,
  run_id: String,
  count: u64,
  gas: Uint128,
  avg_gas: Uint128,
  chain: String,
  tx_proof: Option<String>,
) -> Result<Response, ContractError> {
  // Validate run_id format
  if run_id.trim().is_empty() {
      return Err(ContractError::InvalidRunId("Run ID cannot be empty".into()));
  }

  // Validate chain id format
  if chain.trim().is_empty() {
      return Err(ContractError::InvalidChainId("Chain ID cannot be empty".into()));
  }

  // Validate gas value
  if gas.is_zero() && count > 0 {
      return Err(ContractError::InvalidGasValue("Gas cannot be zero for non-empty test runs".into()));
  }
  
  // Only owner can record test runs
  let state = STATE.load(deps.storage)?;
  if info.sender != state.owner {
      return Err(ContractError::Unauthorized {});
  }
  
  let test_run = TestRunStats {
      timestamp: env.block.time.seconds(),
      message_count: count,
      total_gas: gas,
      avg_gas_per_byte: avg_gas,
      chain_id: chain,
      tx_proof: tx_proof.clone(),
  };
  
  TEST_RUNS.save(deps.storage, &run_id, &test_run)?;
  
  // Update state
  let mut updated_state = state;
  updated_state.test_run_count += 1;
  updated_state.last_test_timestamp = Some(env.block.time.seconds());
  STATE.save(deps.storage, &updated_state)?;
  
  let tx_count = tx_proof.as_ref().map_or(0, |hashes| {
      hashes.split(',').count() as u32
  });
  
  Ok(Response::new()
      .add_attribute("action", "record_test_run")
      .add_attribute("run_id", run_id)
      .add_attribute("count", count.to_string())
      .add_attribute("gas", gas.to_string())
      .add_attribute("tx_count", tx_count.to_string()))
}

// Clear all stored data (admin only)
pub fn execute_clear_data(
  deps: DepsMut,
  env: Env,
  info: MessageInfo,
) -> Result<Response, ContractError> {
  let state = STATE.load(deps.storage)?;
  
  // Only owner can clear data
  if info.sender != state.owner {
      return Err(ContractError::Unauthorized {});
  }
  
  // Delete all messages (range_raw for efficiency)
  let keys_to_remove: Vec<String> = MESSAGES
      .keys(deps.storage, None, None, cosmwasm_std::Order::Ascending)
      .collect::<Result<Vec<_>, _>>()?;
  
  for key in keys_to_remove {
      MESSAGES.remove(deps.storage, &key);
  }
  
  // Delete all test runs
  let run_keys_to_remove: Vec<String> = TEST_RUNS
      .keys(deps.storage, None, None, cosmwasm_std::Order::Ascending)
      .collect::<Result<Vec<_>, _>>()?;
  
  for key in run_keys_to_remove {
      TEST_RUNS.remove(deps.storage, &key);
  }
  
  // Update state but keep configuration
  let updated_state = State {
      owner: state.owner,
      test_run_count: 0,
      last_test_timestamp: Some(env.block.time.seconds()),
  };
  
  STATE.save(deps.storage, &updated_state)?;
  
  Ok(Response::new()
      .add_attribute("action", "clear_data")
      .add_attribute("time", env.block.time.seconds().to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
  match msg {
      QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
      QueryMsg::GetMessage { id } => to_json_binary(&query_message(deps, id)?),
      QueryMsg::ListMessages { start_after, limit } => to_json_binary(&query_list_messages(deps, start_after, limit)?),
      QueryMsg::GetTestRuns { start_after, limit } => to_json_binary(&query_test_runs(deps, start_after, limit)?),
      QueryMsg::GetGasSummary {} => to_json_binary(&query_gas_summary(deps)?),
  }
}

// Query contract configuration
fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
  let state = STATE.load(deps.storage)?;
  
  Ok(ConfigResponse {
      owner: state.owner.to_string(),
      test_count: state.test_run_count,
      last_test: state.last_test_timestamp,
  })
}

// Query msg by id
fn query_message(deps: Deps, id: String) -> StdResult<MessageResponse> {
  let message = MESSAGES.load(deps.storage, &id)?;
  
  Ok(MessageResponse {
      id,
      content: message.content,
      length: message.length,
      time: message.stored_at,
  })
}

/// List msgs paginated
fn query_list_messages(deps: Deps, start_after: Option<String>, limit: Option<u32>) -> StdResult<ListMessagesResponse> {
  // Default limit is 10, max allowed is 30
  let limit = limit.unwrap_or(10).min(30) as usize;
  
  // Convert start_after to Bound
  let start = start_after.as_deref().map(Bound::exclusive);

  let messages: StdResult<Vec<_>> = MESSAGES
      .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
      .take(limit)
      .map(|item| {
          let (id, message) = item?;
          Ok(MessageResponse {
              id: id.to_string(),
              content: message.content,
              length: message.length,
              time: message.stored_at,
          })
      })
      .collect();
  
  let msgs = messages?;
  
  Ok(ListMessagesResponse {
      msgs: msgs.clone(),
      count: msgs.len() as u64,
  })
}

/// Query prev runs paginated
fn query_test_runs(deps: Deps, start_after: Option<String>, limit: Option<u32>) -> StdResult<TestRunsResponse> {
  // Default limit is 5, max allowed is 20
  let limit = limit.unwrap_or(5).min(20) as usize;
  
  // Convert start_after to Bound
  let start = start_after.as_deref().map(Bound::exclusive);

  let runs: StdResult<Vec<_>> = TEST_RUNS
      .range(deps.storage, start, None, cosmwasm_std::Order::Descending)
      .take(limit)
      .map(|item| {
          let (id, run) = item?;
          
          // Count tx proofs
          let tx_count = run.tx_proof.as_ref().map_or(0, |proof| {
              proof.split(',').count() as u32
          });
          
          Ok(TestRunResponse {
              id,
              time: run.timestamp,
              count: run.message_count,
              gas: run.total_gas,
              avg_gas: run.avg_gas_per_byte,
              chain: run.chain_id,
              tx_count,
          })
      })
      .collect();
  
  Ok(TestRunsResponse { runs: runs? })
}

/// Query gas usage metrics
fn query_gas_summary(deps: Deps) -> StdResult<GasSummary> {
  // Compute summary statistics from stored test runs
  let runs: StdResult<Vec<TestRunStats>> = TEST_RUNS
      .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
      .map(|item| item.map(|(_, run)| run))
      .collect();
  
  let runs = runs?;
  let run_count = runs.len() as u64;
  
  if run_count == 0 {
      return Ok(GasSummary {
          msg_count: 0,
          total_gas: Uint128::zero(),
          avg_gas: Uint128::zero(),
          total_bytes: 0,
          gas_per_byte: Uint128::zero(),
      });
  }
  
  // Calculate aggregates
  let mut total_messages = 0u64;
  let mut total_gas = Uint128::zero();
  let mut total_bytes = 0u64;
  
  for run in runs {
      total_messages += run.message_count;
      total_gas += run.total_gas;
      
      // Estimate total bytes based on average gas per byte
      if !run.avg_gas_per_byte.is_zero() {
          let run_bytes = run.total_gas.u128() as u64 / run.avg_gas_per_byte.u128() as u64;
          total_bytes += run_bytes;
      }
  }
  
  // Calculate averages (safely handle division by zero)
  let avg_gas = if total_messages > 0 {
      Uint128::new(total_gas.u128() / total_messages as u128)
  } else {
      Uint128::zero()
  };
  
  let gas_per_byte = if total_bytes > 0 {
      Uint128::new(total_gas.u128() / total_bytes as u128)
  } else {
      Uint128::zero()
  };
  
  Ok(GasSummary {
      msg_count: total_messages,
      total_gas,
      avg_gas,
      total_bytes,
      gas_per_byte,
  })
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_binary};

    #[test]
    fn proper_initialization() {
        let mut deps = mock_dependencies();
        let info = mock_info("creator", &coins(1000, "earth"));
        let msg = InstantiateMsg {};

        // Should succeed
        let res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(0, res.messages.len());

        // Check state
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.owner, "creator");
        assert_eq!(state.test_run_count, 0);
        assert_eq!(state.last_test_timestamp, None);
    }

    #[test]
    fn store_message() {
        let mut deps = mock_dependencies();
        let info = mock_info("creator", &coins(1000, "earth"));
        let msg = InstantiateMsg {};
        instantiate(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Store valid message
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::StoreMessage { content: "test message".to_string() },
        ).unwrap();
        assert_eq!(res.attributes.len(), 3);

        // Test too large message
        let large_msg = "x".repeat((MAX_MESSAGE_SIZE + 1) as usize);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::StoreMessage { content: large_msg },
        ).unwrap_err();
        
        // Should return MessageTooLarge error
        match err {
            ContractError::MessageTooLarge { size, max } => {
                assert_eq!(size, MAX_MESSAGE_SIZE + 1);
                assert_eq!(max, MAX_MESSAGE_SIZE);
            },
            e => panic!("unexpected error: {:?}", e),
        }
    }

    #[test]
    fn fixed_length_message() {
        let mut deps = mock_dependencies();
        let info = mock_info("creator", &coins(1000, "earth"));
        let msg = InstantiateMsg {};
        instantiate(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Test padding (content shorter than target)
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::StoreFixedLength { 
                content: "test".to_string(), 
                length: 10
            },
        ).unwrap();
        assert_eq!(res.attributes.len(), 3);
        
        // Check the message was stored correctly
        let msg_id = res.attributes[1].value.clone(); // id attribute
        let query_res: MessageResponse = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetMessage { id: msg_id }).unwrap()
        ).unwrap();
        assert_eq!(query_res.length, 10);
        assert_eq!(query_res.content, "test      "); // 4 chars + 6 spaces

        // Test truncation (content longer than target)
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::StoreFixedLength { 
                content: "this is a longer test".to_string(), 
                length: 7
            },
        ).unwrap();
        
        let msg_id = res.attributes[1].value.clone();
        let query_res: MessageResponse = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetMessage { id: msg_id }).unwrap()
        ).unwrap();
        assert_eq!(query_res.length, 7);
        assert_eq!(query_res.content, "this is"); // truncated to 7 chars
    }

    #[test]
    fn test_clear_data() {
        let mut deps = mock_dependencies();
        let info = mock_info("creator", &coins(1000, "earth"));
        let msg = InstantiateMsg {};
        instantiate(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Store some test data
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::StoreMessage { content: "test1".to_string() },
        ).unwrap();
        
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::StoreMessage { content: "test2".to_string() },
        ).unwrap();

        // Record a test run
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::RecordTestRun { 
                run_id: "test_run_1".to_string(),
                count: 2,
                gas: Uint128::new(100000),
                avg_gas: Uint128::new(50000),
                chain: "test-chain".to_string(),
                tx_proof: Some("tx1,tx2".to_string())
            },
        ).unwrap();

        // Test unauthorized clear
        let unauth_info = mock_info("someone_else", &coins(1000, "earth"));
        let err = execute(
            deps.as_mut(),
            mock_env(),
            unauth_info,
            ExecuteMsg::ClearData {},
        ).unwrap_err();
        
        // Should return Unauthorized error
        match err {
            ContractError::Unauthorized {} => {},
            e => panic!("unexpected error: {:?}", e),
        }

        // Test authorized clear
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::ClearData {},
        ).unwrap();
        assert_eq!(res.attributes.len(), 2);

        // Verify data was cleared - count should be 0
        let config: ConfigResponse = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetConfig {}).unwrap()
        ).unwrap();
        assert_eq!(config.test_count, 0);

        // Verify gas summary is reset
        let summary: GasSummary = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetGasSummary {}).unwrap()
        ).unwrap();
        assert_eq!(summary.msg_count, 0);
        assert_eq!(summary.total_gas, Uint128::zero());
    }
}