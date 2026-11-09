//! Telling keys and tokens apart from other text (C24.1), so the history can skip them or show
//! them masked. Known prefixes first; then one long token that mixes letters and digits.

/// Prefixes services give their keys and tokens.
const KEY_PREFIXES: &[&str] = &[
    "sk-", "sk_live_", "sk_test_", "rk_live_", "pk_live_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_",
    "github_pat_", "glpat-", "xoxb-", "xoxp-", "xoxa-", "xoxs-", "AKIA", "ASIA", "AIza", "hf_",
    "npm_", "pypi-", "dop_v1_", "shpat_", "SG.",
];

/// A long single token at least this long, mixing letters and digits, counts as a key.
const MIN_TOKEN_LENGTH: usize = 32;

/// Whether `text` looks like a key, token or private key rather than something to keep in history.
pub(crate) fn looks_like_secret(text: &str) -> bool {
    let text = text.trim();
    if text.contains("-----BEGIN") && text.contains("PRIVATE KEY-----") {
        return true;
    }
    // One token only: a sentence or a code snippet that mentions a key is not the key.
    if text.is_empty() || text.chars().any(char::is_whitespace) || text.len() > 512 {
        return false;
    }
    let token_chars = |c: char| c.is_ascii_alphanumeric() || "-_.=/+".contains(c);
    if !text.chars().all(token_chars) {
        return false;
    }
    if KEY_PREFIXES.iter().any(|prefix| text.starts_with(prefix) && text.len() >= prefix.len() + 16) {
        return true;
    }
    // A JSON web token: three base64url parts, the first one a JSON object ("eyJ").
    if text.starts_with("eyJ") && text.split('.').count() == 3 && text.len() >= 40 {
        return true;
    }
    let letters = text.chars().filter(char::is_ascii_alphabetic).count();
    let digits = text.chars().filter(char::is_ascii_digit).count();
    let upper = text.chars().filter(char::is_ascii_uppercase).count();
    let lower = text.chars().filter(char::is_ascii_lowercase).count();
    let looks_like_path_or_url = text.contains("://") || text.starts_with('/') || text.contains("..");
    text.len() >= MIN_TOKEN_LENGTH
        && !looks_like_path_or_url
        && digits >= 4
        && letters >= 8
        && upper >= 2
        && lower >= 2
}

/// The masked preview: the first four characters, then dots.
pub(crate) fn mask(text: &str) -> String {
    let start: String = text.trim().chars().take(4).collect();
    format!("{start}••••••••")
}

#[cfg(test)]
mod tests {
    use super::{looks_like_secret, mask};

    #[test]
    fn keys_and_tokens_are_told_apart_from_text() {
        assert!(looks_like_secret("sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"));
        assert!(looks_like_secret("ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"));
        assert!(looks_like_secret("AKIAIOSFODNN7EXAMPLE1234"));
        assert!(looks_like_secret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"));
        assert!(looks_like_secret("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----"));
        assert!(looks_like_secret("Q3x9Lm2Pz7Rt5Wv8Ny4Bk6Hj1Df0Gs3Ac"));
        assert!(!looks_like_secret("hello world"));
        assert!(!looks_like_secret("my key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"));
        assert!(!looks_like_secret("https://github.com/TixXin/fly-island/blob/main/README.md"));
        assert!(!looks_like_secret("C:/Users/tixxin/Projects/fly-island/src-tauri/src/main.rs"));
        assert!(!looks_like_secret("0f22a9b6c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"));
        assert!(!looks_like_secret("sk-short"));
    }

    #[test]
    fn masks_keep_the_first_four_characters() {
        assert_eq!(mask("  ghp_abcdef "), "ghp_••••••••");
    }
}
