//! Checks a bot token during the setup, before cc-connect runs with it: the bot's name, and on
//! Telegram who has written to it (`getUpdates`), so `allow_from` is picked rather than typed;
//! on Discord the link that invites the bot to a server. Through the update check's proxy. The
//! token is in Telegram's URLs, so it is cut out of every error.

use crate::user_error::UserError;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::system::updater::get_updater_proxy;

const TIMEOUT: Duration = Duration::from_secs(20);
/// What cc-connect's Discord guide asks for: view channels, send messages, read message history,
/// create public threads, send messages in threads.
const DISCORD_PERMISSIONS: u64 = (1 << 10) | (1 << 11) | (1 << 16) | (1 << 35) | (1 << 38);

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BotCheck {
    /// "@name_bot" on Telegram, the bot's user name on Discord.
    name: String,
    invite_url: Option<String>,
    /// Who has written to the bot lately (Telegram); their ids go into `allow_from`.
    senders: Vec<Sender>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Sender {
    id: String,
    name: String,
}

pub(super) async fn check(platform: &str, token: &str) -> Result<BotCheck, UserError> {
    let token = token.trim();
    if token.is_empty() || token.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err(UserError::new("ccConnect.token", "That bot token does not look right."));
    }
    let client = client()?;
    let result = match platform {
        "telegram" => telegram(&client, token).await,
        "discord" => discord(&client, token).await,
        _ => Err(UserError::new("ccConnect.noTokenCheck", format!("{platform} has no token to check.")).arg("platform", platform)),
    };
    result.map_err(|error| error.redact(token))
}

fn client() -> Result<reqwest::Client, UserError> {
    let mut builder = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = get_updater_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| UserError::new("net.proxy", format!("Invalid proxy {proxy}.")).arg("proxy", proxy.as_str()).detail(error))?);
    }
    builder.build().map_err(|error| UserError::new("http.client", "Could not set up the connection.").detail(error))
}

#[derive(Deserialize)]
struct TelegramAnswer {
    ok: bool,
    #[serde(default)]
    error_code: u16,
    #[serde(default)]
    description: String,
    #[serde(default)]
    result: Value,
}

async fn telegram_call(client: &reqwest::Client, token: &str, method: &str) -> Result<Value, UserError> {
    let url = format!("https://api.telegram.org/bot{token}/{method}");
    let answer: TelegramAnswer = client
        .get(&url)
        .send()
        .await
        .map_err(|error| UserError::new("net.unreachable", format!("Could not reach {}.", "Telegram")).arg("service", "Telegram").detail(error))?
        .json()
        .await
        .map_err(|error| UserError::new("net.unreadable", "Could not read Telegram's answer.").arg("service", "Telegram").detail(error))?;
    match (answer.ok, answer.error_code) {
        (true, _) => Ok(answer.result),
        (false, 401 | 404) => Err(UserError::new("ccConnect.telegramToken", "Telegram does not know this token; copy it again from BotFather.")),
        (false, 409) => Err(UserError::new("ccConnect.telegramBusy", "Another program (most likely cc-connect) is receiving this bot's messages; stop it, then look again.")),
        (false, _) => Err(UserError::new("net.said", "Telegram answered with an error.").arg("service", "Telegram").detail(&answer.description)),
    }
}

async fn telegram(client: &reqwest::Client, token: &str) -> Result<BotCheck, UserError> {
    let me = telegram_call(client, token, "getMe").await?;
    let name = format!("@{}", me["username"].as_str().unwrap_or_default());
    // Without an offset nothing is taken off Telegram's queue: cc-connect still gets these.
    let updates = telegram_call(client, token, "getUpdates?timeout=0&limit=100").await?;
    Ok(BotCheck { name, invite_url: None, senders: telegram_senders(&updates) })
}

/// Each person (not bot) who wrote to the bot in `updates`, once, newest last.
fn telegram_senders(updates: &Value) -> Vec<Sender> {
    let mut senders: Vec<Sender> = Vec::new();
    for update in updates.as_array().into_iter().flatten() {
        let from = &update["message"]["from"];
        let (Some(id), false) = (from["id"].as_i64(), from["is_bot"].as_bool().unwrap_or(false)) else { continue };
        let id = id.to_string();
        let full = [from["first_name"].as_str(), from["last_name"].as_str()].into_iter().flatten().collect::<Vec<_>>().join(" ");
        let name = match from["username"].as_str() {
            Some(user) if full.is_empty() => format!("@{user}"),
            Some(user) => format!("{full} (@{user})"),
            None => full,
        };
        senders.retain(|sender| sender.id != id);
        senders.push(Sender { id, name });
    }
    senders
}

async fn discord(client: &reqwest::Client, token: &str) -> Result<BotCheck, UserError> {
    let response = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
        .map_err(|error| UserError::new("net.unreachable", format!("Could not reach {}.", "Discord")).arg("service", "Discord").detail(error))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(UserError::new("ccConnect.discordToken", "Discord does not know this token; reset and copy it on the Bot page of the Developer Portal."));
    }
    if !response.status().is_success() {
        return Err(UserError::new("net.status", format!("Discord answered {}.", response.status())).arg("service", "Discord").arg("status", response.status().as_u16()));
    }
    let me: Value = response.json().await.map_err(|error| UserError::new("net.unreadable", "Could not read Discord's answer.").arg("service", "Discord").detail(error))?;
    let id = me["id"].as_str().filter(|id| id.bytes().all(|byte| byte.is_ascii_digit())).ok_or_else(|| UserError::new("ccConnect.discordId", "Discord did not give the bot's id."))?;
    Ok(BotCheck {
        name: me["username"].as_str().unwrap_or_default().to_string(),
        invite_url: Some(discord_invite(id)),
        senders: Vec::new(),
    })
}

fn discord_invite(bot_id: &str) -> String {
    format!("https://discord.com/oauth2/authorize?client_id={bot_id}&scope=bot&permissions={DISCORD_PERMISSIONS}")
}

#[cfg(test)]
mod tests {
    use super::{check, discord_invite, telegram_senders, Sender};
    use serde_json::json;

    #[test]
    #[ignore = "asks Telegram and Discord"]
    fn a_wrong_token_is_named_and_never_shown() {
        for platform in ["telegram", "discord"] {
            let error = tauri::async_runtime::block_on(check(platform, "123456:not-a-real-token")).unwrap_err();
            assert!(error.code().ends_with("Token"), "{platform}: {error}");
            assert!(!error.to_string().contains("not-a-real-token"), "{platform}: {error}");
        }
    }

    #[test]
    fn telegram_senders_are_people_once_each_with_a_readable_name() {
        let updates = json!([
            { "message": { "from": { "id": 1, "is_bot": false, "first_name": "Ada", "last_name": "Lovelace", "username": "ada" } } },
            { "message": { "from": { "id": 2, "is_bot": true, "first_name": "Other bot" } } },
            { "edited_message": { "from": { "id": 3, "first_name": "Edited" } } },
            { "message": { "from": { "id": 4, "username": "only_user" } } },
            { "message": { "from": { "id": 1, "first_name": "Ada" } } },
        ]);
        let sender = |id: &str, name: &str| Sender { id: id.into(), name: name.into() };
        assert_eq!(telegram_senders(&updates), [sender("4", "@only_user"), sender("1", "Ada")]);
        assert_eq!(telegram_senders(&json!([updates[0].clone()])), [sender("1", "Ada Lovelace (@ada)")]);
        assert_eq!(telegram_senders(&json!(null)), []);
    }

    #[test]
    fn the_discord_invite_asks_for_what_cc_connect_needs() {
        assert_eq!(
            discord_invite("42"),
            "https://discord.com/oauth2/authorize?client_id=42&scope=bot&permissions=309237713920"
        );
    }
}
