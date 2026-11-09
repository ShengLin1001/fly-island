//! Checks a bot token during the setup, before cc-connect runs with it: the bot's name, and on
//! Telegram who has written to it (`getUpdates`), so `allow_from` is picked rather than typed;
//! on Discord the link that invites the bot to a server. Through the update check's proxy. The
//! token is in Telegram's URLs, so it is cut out of every error.

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

pub(super) async fn check(platform: &str, token: &str) -> Result<BotCheck, String> {
    let token = token.trim();
    if token.is_empty() || token.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err("机器人 token 不对。".into());
    }
    let client = client()?;
    let result = match platform {
        "telegram" => telegram(&client, token).await,
        "discord" => discord(&client, token).await,
        _ => Err(format!("{platform} 不用检查 token。")),
    };
    result.map_err(|error| error.replace(token, "[token]"))
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = get_updater_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
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

async fn telegram_call(client: &reqwest::Client, token: &str, method: &str) -> Result<Value, String> {
    let url = format!("https://api.telegram.org/bot{token}/{method}");
    let answer: TelegramAnswer = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("连不上 Telegram：{error}"))?
        .json()
        .await
        .map_err(|error| format!("Telegram 的回答读不懂：{error}"))?;
    match (answer.ok, answer.error_code) {
        (true, _) => Ok(answer.result),
        (false, 401 | 404) => Err("Telegram 不认这个 token，请从 BotFather 重新复制。".into()),
        (false, 409) => Err("这个机器人正被别的程序（多半是 cc-connect）收消息，先停掉它再识别。".into()),
        (false, _) => Err(format!("Telegram：{}", answer.description)),
    }
}

async fn telegram(client: &reqwest::Client, token: &str) -> Result<BotCheck, String> {
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

async fn discord(client: &reqwest::Client, token: &str) -> Result<BotCheck, String> {
    let response = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
        .map_err(|error| format!("连不上 Discord：{error}"))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Discord 不认这个 token，请在开发者门户的 Bot 页重新生成并复制。".into());
    }
    if !response.status().is_success() {
        return Err(format!("Discord 回答 {}。", response.status()));
    }
    let me: Value = response.json().await.map_err(|error| format!("Discord 的回答读不懂：{error}"))?;
    let id = me["id"].as_str().filter(|id| id.bytes().all(|byte| byte.is_ascii_digit())).ok_or("Discord 没给出机器人的 id。")?;
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
            assert!(error.contains("token"), "{platform}: {error}");
            assert!(!error.contains("not-a-real-token"), "{platform}: {error}");
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
