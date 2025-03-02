use cosmwasm_std::{
  entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
  to_json_binary, Addr, Uint128, 
};
use cw_storage_plus::{Bound, Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// Optimized contract state
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
  pub total_gas: Uint128,  // Rename for clarity
  pub avg_gas_per_byte: Uint128, // Shorter name for storage efficiency
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
  // Store a message with specific length
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

// Query messages with optimized names
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
  // Get contract configuration
  GetConfig {},
  // Get a specific message by ID
  GetMessage { id: String },
  // List all messages (with pagination)
  ListMessages { 
      start_after: Option<String>,
      limit: Option<u32>,
  },
  // Get test run statistics (with pagination)
  GetTestRuns {
      start_after: Option<String>,
      limit: Option<u32>,
  },
  // Get gas usage summary
  GetGasSummary {},
}

// Response types optimized for space

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
  pub tx_count: u32, // Number of transaction proofs
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

// Efficient storage definitions
pub const STATE: Item<State> = Item::new("state");
pub const MESSAGES: Map<&str, StoredMessage> = Map::new("msgs");
pub const TEST_RUNS: Map<&str, TestRunStats> = Map::new("runs");

#[entry_point]
pub fn instantiate(
  deps: DepsMut,
  _env: Env,
  info: MessageInfo,
  _msg: InstantiateMsg,
) -> StdResult<Response> {
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
) -> StdResult<Response> {
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

pub fn execute_store_message(
  deps: DepsMut,
  env: Env,
  _info: MessageInfo,
  content: String,
) -> StdResult<Response> {
  let id = format!("msg_{}", env.block.height);
  let length = content.len() as u64;

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

pub fn execute_store_fixed_length(
  deps: DepsMut,
  env: Env,
  _info: MessageInfo,
  content: String,
  target_length: u64,
) -> StdResult<Response> {
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
) -> StdResult<Response> {
  // Only owner can record test runs
  let mut state = STATE.load(deps.storage)?;
  if info.sender != state.owner {
      return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
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
  state.test_run_count += 1;
  state.last_test_timestamp = Some(env.block.time.seconds());
  STATE.save(deps.storage, &state)?;
  
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

pub fn execute_clear_data(
  deps: DepsMut,
  env: Env,
  info: MessageInfo,
) -> StdResult<Response> {
  let state = STATE.load(deps.storage)?;
  
  // Only owner can clear data
  if info.sender != state.owner {
      return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
  }
  
  // Delete all messages (efficient using range_raw)
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

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
  let state = STATE.load(deps.storage)?;
  
  Ok(ConfigResponse {
      owner: state.owner.to_string(),
      test_count: state.test_run_count,
      last_test: state.last_test_timestamp,
  })
}

fn query_message(deps: Deps, id: String) -> StdResult<MessageResponse> {
  let message = MESSAGES.load(deps.storage, &id)?;
  
  Ok(MessageResponse {
      id,
      content: message.content,
      length: message.length,
      time: message.stored_at,
  })
}

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

fn query_gas_summary(deps: Deps) -> StdResult<GasSummary> {
  // Compute summary statistics from stored test runs
  let runs: StdResult<Vec<TestRunStats>> = TEST_RUNS
      .range(deps.storage, None::<Bound<&str>>, None, cosmwasm_std::Order::Ascending)
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