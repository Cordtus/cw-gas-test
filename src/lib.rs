use cosmwasm_std::{
  entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
  to_json_binary, Addr,
};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// Contract state
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct State {
  pub owner: Addr,
  pub btc_timestamp_enabled: bool,
  pub babylon_contract: Option<Addr>,
}

// Storage for messages of different lengths
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct StoredMessage {
  pub content: String,
  pub length: u64,
  pub btc_finalized: bool,
  pub btc_height: Option<u64>,
  pub btc_timestamp: Option<u64>,
}

// Initialize message
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
  pub btc_timestamp_enabled: bool,
  pub babylon_contract: Option<String>,
}

// Execute messages
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
  // Store a message of any length
  StoreMessage {
      content: String,
  },
  // Store a message with specific length (padding with spaces if needed)
  StoreFixedLengthMessage {
      content: String,
      target_length: u64,
  },
  // Delete a message with the given ID
  DeleteMessage {
      id: String,
  },
  // Update BTC status for a message using Babylon API
  UpdateBtcStatus {
      id: String,
      data_hash: String,
  },
}

// Query messages
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
  // Get contract configuration
  GetConfig {},
  // Get a specific message by ID
  GetMessage {
      id: String,
  },
  // List all messages
  ListMessages {},
}

// For querying Babylon contract
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BabylonQuery {
  CheckData { data_hash: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct BabylonDataResponse {
  pub finalized: bool,
  pub data: Option<DataDetails>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct DataDetails {
  pub btc_height: u64,
  pub btc_timestamp: u64,
}

// Response types
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigResponse {
  pub owner: String,
  pub btc_timestamp_enabled: bool,
  pub babylon_contract: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct MessageResponse {
  pub id: String,
  pub content: String,
  pub length: u64,
  pub btc_status: BtcStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct BtcStatus {
  pub finalized: bool,
  pub btc_height: Option<u64>,
  pub btc_timestamp: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ListMessagesResponse {
  pub messages: Vec<MessageResponse>,
}

// Define storage
pub const STATE: Item<State> = Item::new("state");
pub const MESSAGES: Map<&str, StoredMessage> = Map::new("messages");

#[entry_point]
pub fn instantiate(
  deps: DepsMut,
  _env: Env,
  info: MessageInfo,
  msg: InstantiateMsg,
) -> StdResult<Response> {
  let babylon_contract = match msg.babylon_contract {
      Some(addr) => Some(deps.api.addr_validate(&addr)?),
      None => None,
  };

  let state = State {
      owner: info.sender.clone(),
      btc_timestamp_enabled: msg.btc_timestamp_enabled,
      babylon_contract,
  };

  STATE.save(deps.storage, &state)?;

  Ok(Response::new()
      .add_attribute("method", "instantiate")
      .add_attribute("owner", info.sender)
      .add_attribute("btc_timestamp_enabled", msg.btc_timestamp_enabled.to_string()))
}

#[entry_point]
pub fn execute(
  deps: DepsMut,
  env: Env,
  info: MessageInfo,
  msg: ExecuteMsg,
) -> StdResult<Response> {
  match msg {
      ExecuteMsg::StoreMessage { content } => execute_store_message(deps, env, info, content),
      ExecuteMsg::StoreFixedLengthMessage { content, target_length } => {
          execute_store_fixed_length_message(deps, env, info, content, target_length)
      }
      ExecuteMsg::DeleteMessage { id } => execute_delete_message(deps, env, info, id),
      ExecuteMsg::UpdateBtcStatus { id, data_hash } => {
          execute_update_btc_status(deps, env, info, id, data_hash)
      }
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
      btc_finalized: false,
      btc_height: None,
      btc_timestamp: None,
  };

  MESSAGES.save(deps.storage, &id, &message)?;

  Ok(Response::new()
      .add_attribute("action", "store_message")
      .add_attribute("id", id)
      .add_attribute("length", length.to_string()))
}

pub fn execute_store_fixed_length_message(
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
      btc_finalized: false,
      btc_height: None,
      btc_timestamp: None,
  };

  MESSAGES.save(deps.storage, &id, &message)?;

  Ok(Response::new()
      .add_attribute("action", "store_fixed_length_message")
      .add_attribute("id", id)
      .add_attribute("target_length", target_length.to_string())
      .add_attribute("actual_length", actual_length.to_string()))
}

pub fn execute_delete_message(
  deps: DepsMut,
  _env: Env,
  info: MessageInfo,
  id: String,
) -> StdResult<Response> {
  let state = STATE.load(deps.storage)?;
  
  // Only owner can delete messages
  if info.sender != state.owner {
      return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
  }
  
  MESSAGES.remove(deps.storage, &id);
  
  Ok(Response::new()
      .add_attribute("action", "delete_message")
      .add_attribute("id", id))
}

pub fn execute_update_btc_status(
  deps: DepsMut,
  _env: Env,
  _info: MessageInfo,
  id: String,
  data_hash: String,
) -> StdResult<Response> {
  let state = STATE.load(deps.storage)?;
  
  // Check if the message exists
  let mut message = MESSAGES.load(deps.storage, &id)?;
  
  if !state.btc_timestamp_enabled {
      return Ok(Response::new()
          .add_attribute("action", "update_btc_status")
          .add_attribute("result", "skipped")
          .add_attribute("reason", "BTC timestamping disabled"));
  }
  
  if let Some(babylon_contract) = &state.babylon_contract {
      let query_msg = BabylonQuery::CheckData { 
          data_hash 
      };
      
      let query = cosmwasm_std::WasmQuery::Smart {
          contract_addr: babylon_contract.to_string(),
          msg: to_json_binary(&query_msg)?,
      };

      let response: BabylonDataResponse = deps.querier.query(&cosmwasm_std::QueryRequest::Wasm(query))?;
      
      message.btc_finalized = response.finalized;
      
      if let Some(data) = response.data {
          message.btc_height = Some(data.btc_height);
          message.btc_timestamp = Some(data.btc_timestamp);
      }
      
      MESSAGES.save(deps.storage, &id, &message)?;
      
      Ok(Response::new()
          .add_attribute("action", "update_btc_status")
          .add_attribute("id", id)
          .add_attribute("finalized", response.finalized.to_string()))
  } else {
      Err(cosmwasm_std::StdError::generic_err("Babylon contract not configured"))
  }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
  match msg {
      QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
      QueryMsg::GetMessage { id } => to_json_binary(&query_message(deps, id)?),
      QueryMsg::ListMessages {} => to_json_binary(&query_list_messages(deps)?),
  }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
  let state = STATE.load(deps.storage)?;
  
  Ok(ConfigResponse {
      owner: state.owner.to_string(),
      btc_timestamp_enabled: state.btc_timestamp_enabled,
      babylon_contract: state.babylon_contract.map(|addr| addr.to_string()),
  })
}

fn query_message(deps: Deps, id: String) -> StdResult<MessageResponse> {
  let message = MESSAGES.load(deps.storage, &id)?;
  
  Ok(MessageResponse {
      id,
      content: message.content,
      length: message.length,
      btc_status: BtcStatus {
          finalized: message.btc_finalized,
          btc_height: message.btc_height,
          btc_timestamp: message.btc_timestamp,
      },
  })
}

fn query_list_messages(deps: Deps) -> StdResult<ListMessagesResponse> {
  let messages: StdResult<Vec<_>> = MESSAGES
      .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
      .map(|item| {
          let (id, message) = item?;
          Ok(MessageResponse {
              id: id.to_string(),
              content: message.content,
              length: message.length,
              btc_status: BtcStatus {
                  finalized: message.btc_finalized,
                  btc_height: message.btc_height,
                  btc_timestamp: message.btc_timestamp,
              },
          })
      })
      .collect();
  
  Ok(ListMessagesResponse {
      messages: messages?,
  })
}