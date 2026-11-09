//! Likes on the market cards (issue #16): stars.json next to the index in
//! TixXin/focusd-plugins, counted every hour from the 👍 on one discussion per
//! plugin. Not signed, because it is only shown; a link must point at a discussion
//! of that repository, and anything odd is dropped rather than failing the page.
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::market::{client, download_unless_missing};

const LIKES_URL: &str = "https://raw.githubusercontent.com/TixXin/focusd-plugins/main/stars.json";
const LIKES_VERSION: u32 = 1;
const DISCUSSION_PREFIX: &str = "https://github.com/TixXin/focusd-plugins/discussions/";
const MAX_LIKES_BYTES: u64 = 256 * 1024;

/// One plugin's likes. Mirrored by `MarketLike` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketLike {
    count: u32,
    /// The discussion to give the like on.
    url: String,
}

#[derive(Deserialize)]
struct LikesFile {
    version: u32,
    #[serde(default)]
    plugins: BTreeMap<String, serde_json::Value>,
}

fn is_plugin_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-')
}

fn is_discussion(url: &str) -> bool {
    url.strip_prefix(DISCUSSION_PREFIX)
        .is_some_and(|number| (1..=9).contains(&number.len()) && number.bytes().all(|byte| byte.is_ascii_digit()))
}

/// The likes in stars.json; entries with a bad id or link are left out.
fn parse_likes(text: &str) -> Result<BTreeMap<String, MarketLike>, String> {
    let file: LikesFile = serde_json::from_str(text).map_err(|error| format!("stars.json is not valid: {error}"))?;
    if file.version != LIKES_VERSION {
        return Err(format!("stars.json has format {}; this FocuSD Island reads format {LIKES_VERSION}.", file.version));
    }
    Ok(file
        .plugins
        .into_iter()
        .filter(|(id, _)| is_plugin_id(id))
        .filter_map(|(id, value)| serde_json::from_value::<MarketLike>(value).ok().map(|like| (id, like)))
        .filter(|(_, like)| is_discussion(&like.url))
        .collect())
}

/// The market's likes per plugin id; empty while the file does not exist yet.
#[tauri::command]
pub async fn get_plugin_market_likes() -> Result<BTreeMap<String, MarketLike>, String> {
    let client = client()?;
    match download_unless_missing(&client, LIKES_URL, MAX_LIKES_BYTES).await? {
        Some(bytes) => parse_likes(&String::from_utf8_lossy(&bytes)),
        None => Ok(BTreeMap::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_likes_with_a_discussion_link_of_the_market() {
        let likes = parse_likes(
            r#"{ "version": 1, "updatedAt": "2026-11-09T00:00:00Z", "plugins": {
                "dev.focusd.pomodoro": { "count": 3, "url": "https://github.com/TixXin/focusd-plugins/discussions/4" },
                "dev.focusd.elsewhere": { "count": 9, "url": "https://example.com/discussions/4" },
                "dev.focusd.deeper": { "count": 9, "url": "https://github.com/TixXin/focusd-plugins/discussions/4/x" },
                "Bad Id": { "count": 1, "url": "https://github.com/TixXin/focusd-plugins/discussions/5" },
                "dev.focusd.negative": { "count": -1, "url": "https://github.com/TixXin/focusd-plugins/discussions/6" }
            } }"#,
        )
        .unwrap();
        assert_eq!(likes.len(), 1);
        assert_eq!(likes["dev.focusd.pomodoro"], MarketLike { count: 3, url: "https://github.com/TixXin/focusd-plugins/discussions/4".into() });
    }

    #[test]
    fn a_newer_format_is_an_error() {
        assert!(parse_likes(r#"{ "version": 2, "plugins": {} }"#).is_err());
        assert!(parse_likes("not json").is_err());
    }
}
