//! Mail over IMAP (QQ Mail first, any `imap.<domain>` server): commands,
//! snapshot types and the background service. The module keeps its mail
//! name because the command names are a contract with the frontend.

mod accounts;
mod attachments;
mod send;
mod client_id;
mod content;
mod credentials;
mod plugin_view;
mod service;
mod session;
mod supervisor;

#[cfg(test)]
mod tests;

use crate::user_error::UserError;
use serde::Serialize;
use std::{sync::mpsc, time::Instant};
use tauri::AppHandle;

use content::parse_message_id;

pub(crate) use plugin_view::plugin_messages;
use credentials::{delete_secret, normalize_email, read_secret, resolve_host};
use service::{MailService, Work};

const EVENT: &str = "qq-mail-changed";

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    id: String,
    uid: u32,
    sender: String,
    subject: String,
    received_at: Option<i64>,
    unread: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailContent {
    id: String,
    content: String,
    content_type: String,
    /// The message's attachments; saved one at a time with save_qq_mail_attachment.
    attachments: Vec<attachments::AttachmentInfo>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MailStatus {
    Disconnected,
    Connecting,
    Connected,
    Paused,
    AuthRequired,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailSnapshot {
    revision: u64,
    email: Option<String>,
    configured: bool,
    enabled: bool,
    syncing: bool,
    status: MailStatus,
    unread_count: Option<usize>,
    items: Vec<MailMessage>,
    last_synced_at: Option<i64>,
    error: Option<UserError>,
}

impl Default for MailSnapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            email: None,
            configured: false,
            enabled: false,
            syncing: false,
            status: MailStatus::Disconnected,
            unread_count: None,
            items: Vec::new(),
            last_synced_at: None,
            error: None,
        }
    }
}

pub fn init(app: &AppHandle) -> Result<(), UserError> {
    accounts::init(app);
    Ok(())
}

#[tauri::command]
pub fn get_qq_mail_state() -> Result<Vec<MailSnapshot>, UserError> {
    accounts::all()
        .iter()
        .map(|service| Ok(service.lock()?.snapshot.clone()))
        .collect()
}

#[tauri::command]
pub async fn connect_qq_mail(
    email: String,
    authorization_code: String,
    host: Option<String>,
) -> Result<MailSnapshot, UserError> {
    let email = normalize_email(&email)?;
    let host = resolve_host(&email, host.as_deref())?;
    let secret = authorization_code.trim().to_string();
    if secret.is_empty() || secret.len() > 256 || secret.chars().any(char::is_control) {
        return Err(UserError::new("mail.needCode", "Enter the authorization code made in the mailbox settings."));
    }
    let service = accounts::find_or_start(&email, &host)?;
    let (generation, snapshot) = {
        let mut state = service.lock()?;
        state.invalidate();
        state.snapshot.enabled = true;
        state.snapshot.syncing = true;
        state.snapshot.status = MailStatus::Connecting;
        state.snapshot.error = None;
        (state.generation, state.changed())
    };
    service.publish(snapshot, None);
    let (reply, receiver) = mpsc::channel();
    service
        .send(Work::Connect {
            generation,
            email,
            secret,
            reply,
        })
        .map_err(|_| UserError::new("mail.serviceDown", "The mail service is not available."))?;
    let result = await_reply(receiver).await;
    if result.is_err() {
        forget_if_never_connected(&service);
    }
    result
}

/// A mailbox whose first connection failed has no saved code; drop it so it
/// neither lingers as a tab nor counts toward the account limit.
fn forget_if_never_connected(service: &MailService) {
    let Ok(mut state) = service.lock() else { return };
    if state.snapshot.configured {
        return;
    }
    state.invalidate();
    state.snapshot = MailSnapshot {
        email: Some(service.email.clone()),
        ..MailSnapshot::default()
    };
    let snapshot = state.changed();
    drop(state);
    accounts::remove(&service.email);
    service.publish(snapshot, None);
}

#[tauri::command]
pub async fn set_qq_mail_enabled(
    email: String,
    enabled: bool,
    host: Option<String>,
) -> Result<MailSnapshot, UserError> {
    let email = normalize_email(&email)?;
    let host = resolve_host(&email, host.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = accounts::find_or_start(&email, &host)?;
        let mut state = service.lock()?;
        if state.snapshot.configured && state.snapshot.enabled == enabled {
            return Ok(state.snapshot.clone());
        }
        let configured = read_secret(&email)?.is_some();
        state.invalidate();
        state.snapshot.configured = configured;
        state.snapshot.enabled = enabled && configured;
        state.snapshot.status = if !configured {
            MailStatus::AuthRequired
        } else if enabled {
            MailStatus::Connecting
        } else {
            MailStatus::Paused
        };
        state.snapshot.error = if configured {
            None
        } else {
            Some(UserError::new("mail.codeMissing", "The saved authorization code was not found; connect again."))
        };
        if enabled && configured {
            state.next_check = Some(Instant::now());
        }
        let snapshot = state.changed();
        drop(state);
        service.publish(snapshot.clone(), None);
        let _ = service.send(Work::Wake);
        Ok(snapshot)
    })
    .await
    .map_err(|_| UserError::new("mail.update", "Could not update the mail connection."))?
}

#[tauri::command]
pub async fn refresh_qq_mail(email: String) -> Result<MailSnapshot, UserError> {
    let service = accounts::find(&normalize_email(&email)?)?;
    if !service.is_alive() {
        // Checked first: begin_sync would mark it syncing with no worker to finish.
        return Err(UserError::new("mail.stopped", "The mail connection stopped; authorize again in Settings, or pause and resume receiving."));
    }
    let Some((generation, _)) = service.begin_sync() else {
        let snapshot = service.lock()?.snapshot.clone();
        return if snapshot.syncing {
            Ok(snapshot)
        } else {
            Err(UserError::new("mail.connectAndEnable", "Connect the mailbox and turn receiving on first."))
        };
    };
    let (reply, receiver) = mpsc::channel();
    service
        .send(Work::Refresh { generation, reply })
        .map_err(|_| UserError::new("mail.serviceDown", "The mail service is not available."))?;
    await_reply(receiver).await
}

#[tauri::command]
pub async fn read_qq_mail(email: String, message_id: String) -> Result<MailContent, UserError> {
    parse_message_id(&message_id)?;
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    let generation = {
        let state = service.lock()?;
        if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
            return Err(UserError::new("mail.connect", "Connect a mailbox first."));
        }
        if !state
            .snapshot
            .items
            .iter()
            .any(|item| item.id == message_id)
        {
            return Err(UserError::new("mail.notRecent", "The mail is no longer in the recent list; refresh the inbox."));
        }
        state.generation
    };
    tauri::async_runtime::spawn_blocking(move || service.read(generation, &email, &message_id))
        .await
        .map_err(|_| UserError::new("mail.read", "Could not read the mail."))?
}

fn configured_service(email: &str) -> Result<std::sync::Arc<MailService>, UserError> {
    let service = accounts::find(email)?;
    let state = service.lock()?;
    if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
        return Err(UserError::new("mail.connect", "Connect a mailbox first."));
    }
    drop(state);
    Ok(service)
}

/// Recipient and subject to start a reply to a listed message with.
#[tauri::command]
pub async fn get_qq_mail_reply(email: String, message_id: String) -> Result<send::ReplyDraft, UserError> {
    parse_message_id(&message_id)?;
    let email = normalize_email(&email)?;
    let service = configured_service(&email)?;
    tauri::async_runtime::spawn_blocking(move || service.reply_draft(&email, &message_id))
        .await
        .map_err(|_| UserError::new("mail.read", "Could not read the mail."))?
}

/// Sends plain-text mail from a connected mailbox over SMTP (smtp.<domain>, TLS),
/// as a reply to `reply_to` when given; the threading headers are read from the server.
#[tauri::command]
pub async fn send_qq_mail(email: String, mail: send::OutgoingMail, reply_to: Option<String>) -> Result<(), UserError> {
    if let Some(message_id) = &reply_to {
        parse_message_id(message_id)?;
    }
    let email = normalize_email(&email)?;
    let service = configured_service(&email)?;
    tauri::async_runtime::spawn_blocking(move || service.send_mail(&email, &mail, reply_to.as_deref()))
        .await
        .map_err(|_| UserError::new("mail.sendUnfinished", "Sending did not finish."))?
}

/// Saves one attachment of a listed message into the Downloads folder and shows it
/// in Explorer. Returns the path written (never an existing file).
#[tauri::command]
pub async fn save_qq_mail_attachment(email: String, message_id: String, part: String) -> Result<String, UserError> {
    parse_message_id(&message_id)?;
    if part.is_empty() || part.len() > 64 || !part.split('.').all(|segment| !segment.is_empty() && segment.bytes().all(|byte| byte.is_ascii_digit())) {
        return Err(UserError::new("mail.badPart", "The attachment id is not valid; open the mail again."));
    }
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    {
        let state = service.lock()?;
        if !state.snapshot.configured || !state.snapshot.items.iter().any(|item| item.id == message_id) {
            return Err(UserError::new("mail.notRecent", "The mail is no longer in the recent list; refresh the inbox."));
        }
    }
    let saved = tauri::async_runtime::spawn_blocking(move || service.save_attachment(&email, &message_id, &part))
        .await
        .map_err(|_| UserError::new("mail.saveAttachment", "Could not save the attachment."))??;
    let _ = tauri_plugin_opener::reveal_item_in_dir(&saved);
    Ok(saved.to_string_lossy().into_owned())
}

/// Marks a listed message read on the server; reading in the island never does.
#[tauri::command]
pub async fn mark_qq_mail_read(email: String, message_id: String) -> Result<MailSnapshot, UserError> {
    parse_message_id(&message_id)?;
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    let generation = {
        let state = service.lock()?;
        if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
            return Err(UserError::new("mail.connect", "Connect a mailbox first."));
        }
        if !state.snapshot.items.iter().any(|item| item.id == message_id) {
            return Err(UserError::new("mail.notRecent", "The mail is no longer in the recent list; refresh the inbox."));
        }
        state.generation
    };
    tauri::async_runtime::spawn_blocking(move || service.mark_read(generation, &email, &message_id))
        .await
        .map_err(|_| UserError::new("mail.markRead", "Could not mark the mail as read."))?
}

#[tauri::command]
pub async fn disconnect_qq_mail(email: String) -> Result<MailSnapshot, UserError> {
    let email = normalize_email(&email)?;
    tauri::async_runtime::spawn_blocking(move || {
        let disconnected = |revision| MailSnapshot {
            revision,
            email: Some(email.clone()),
            ..MailSnapshot::default()
        };
        let Ok(service) = accounts::find(&email) else {
            // Nothing running for it: still make sure no code stays behind.
            delete_secret(&email)?;
            return Ok(disconnected(accounts::next_revision()));
        };
        let mut state = service.lock()?;
        state.invalidate();
        state.snapshot.enabled = false;
        if delete_secret(&email).is_err() {
            state.snapshot.status = MailStatus::Paused;
            state.snapshot.error =
                Some(UserError::new("mail.disconnectPartly", "Receiving stopped, but deleting the saved code from Windows Credential Manager failed; disconnect again."));
            let snapshot = state.changed();
            drop(state);
            service.publish(snapshot, None);
            let _ = service.send(Work::Wake);
            return Err(UserError::new("mail.disconnectCredential", "Deleting the saved code failed; disconnect again."));
        }
        state.snapshot = disconnected(0);
        let snapshot = state.changed();
        drop(state);
        accounts::remove(&email);
        service.publish(snapshot.clone(), None);
        Ok(snapshot)
    })
    .await
    .map_err(|_| UserError::new("mail.disconnect", "Could not disconnect the mailbox."))?
}

async fn await_reply<T: Send + 'static>(
    receiver: mpsc::Receiver<Result<T, UserError>>,
) -> Result<T, UserError> {
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .unwrap_or_else(|_| Err(UserError::new("mail.serviceDown", "The mail service is not available.")))
    })
    .await
    .map_err(|_| UserError::new("mail.connectUnfinished", "Connecting did not finish."))?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::mail::get_qq_mail_state,
            crate::mail::connect_qq_mail,
            crate::mail::set_qq_mail_enabled,
            crate::mail::refresh_qq_mail,
            crate::mail::read_qq_mail,
            crate::mail::mark_qq_mail_read,
            crate::mail::save_qq_mail_attachment,
            crate::mail::get_qq_mail_reply,
            crate::mail::send_qq_mail,
            crate::mail::disconnect_qq_mail,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
