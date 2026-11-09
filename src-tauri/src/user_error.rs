//! Errors the user reads (task D15). A command fails with a code that the frontend words in the
//! island's language (src/i18n/sections/errors.ts), the values that wording needs, and what an
//! outside program or service said, passed on as it is. `message` says the same in English, for
//! logs, plugins and a page that does not know the code yet. Commands still answering with a plain
//! string keep working: the frontend shows a string as it is.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fmt;

/// Mirrored by NativeError in src/i18n/nativeError.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserError {
    code: &'static str,
    #[serde(skip_serializing_if = "Map::is_empty")]
    args: Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    message: String,
}

impl UserError {
    /// `code` names the wording in src/i18n/sections/errors.ts; `message` is it in English.
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, args: Map::new(), detail: None, message: message.into() }
    }

    /// A value the wording puts in, like a file path or a status code.
    pub(crate) fn arg(mut self, name: &str, value: impl Into<Value>) -> Self {
        self.args.insert(name.to_string(), value.into());
        self
    }

    /// What an outside program, service or Windows said; shown after the wording, untranslated.
    pub(crate) fn detail(mut self, detail: impl fmt::Display) -> Self {
        let text = detail.to_string();
        self.detail = (!text.trim().is_empty()).then_some(text);
        self
    }

    #[cfg(test)]
    pub(crate) fn code(&self) -> &'static str {
        self.code
    }
}

impl fmt::Display for UserError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(formatter, "{}: {detail}", self.message.trim_end_matches('.')),
            None => formatter.write_str(&self.message),
        }
    }
}

/// A message not given a code yet: the page shows it as it is.
impl From<String> for UserError {
    fn from(message: String) -> Self {
        Self::new("plain", message)
    }
}

impl From<&str> for UserError {
    fn from(message: &str) -> Self {
        Self::new("plain", message)
    }
}

/// Windows Credential Manager, where the island keeps keys, passwords and tokens.
pub(crate) mod credential {
    use super::UserError;

    pub(crate) fn open(error: impl std::fmt::Display) -> UserError {
        UserError::new("credential.open", "Could not open Windows Credential Manager.").detail(error)
    }

    pub(crate) fn read(error: impl std::fmt::Display) -> UserError {
        UserError::new("credential.read", "Could not read from Windows Credential Manager.").detail(error)
    }

    pub(crate) fn save(error: impl std::fmt::Display) -> UserError {
        UserError::new("credential.save", "Could not save to Windows Credential Manager.").detail(error)
    }

    pub(crate) fn delete(error: impl std::fmt::Display) -> UserError {
        UserError::new("credential.delete", "Could not delete from Windows Credential Manager.").detail(error)
    }
}

#[cfg(test)]
mod tests {
    use super::UserError;
    use serde_json::json;

    #[test]
    fn the_page_gets_the_code_values_and_what_the_service_said() {
        let error = UserError::new("bark.status", "Bark answered an error.").arg("status", 500).detail("busy");
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            json!({ "code": "bark.status", "args": { "status": 500 }, "detail": "busy", "message": "Bark answered an error." })
        );
        assert_eq!(error.to_string(), "Bark answered an error: busy");
    }

    #[test]
    fn a_bare_message_has_no_args_or_detail() {
        let error = UserError::from("Something broke.").detail("  ");
        assert_eq!(serde_json::to_value(&error).unwrap(), json!({ "code": "plain", "message": "Something broke." }));
        assert_eq!(error.code(), "plain");
    }
}
