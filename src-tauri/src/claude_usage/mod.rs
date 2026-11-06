//! Claude subscription usage (5-hour and 7-day windows) for the island's usage
//! ring. A background poller (started and stopped by its built-in plugin) asks
//! the OAuth usage endpoint every few minutes and falls back to claude-hud's
//! usage file; each new snapshot goes to the frontend as `claude-usage-updated`.

mod source;
#[cfg(test)]
mod tests;

use serde::Serialize;
use source::{FetchError, Limits};
use std::{
    path::PathBuf,
    sync::{mpsc, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::{Duration, Instant, SystemTime},
};
use tauri::{AppHandle, Emitter};

pub(crate) const CLAUDE_USAGE_UPDATED_EVENT: &str = "claude-usage-updated";
const MIN_INTERVAL_MINUTES: u64 = 5;
const MAX_INTERVAL_MINUTES: u64 = 120;
const MAX_BACKOFF: Duration = Duration::from_secs(60 * 60);
/// A refresh button pressed again within this gap reuses the last answer.
const MANUAL_MIN_GAP: Duration = Duration::from_secs(60);

/// Mirrored by ClaudeUsageWindow in src/features/claude-usage/api.ts.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    /// 0–100.
    pub percent: f64,
    /// ISO 8601, as the source gave it.
    pub resets_at: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageSource {
    Api,
    Hud,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageErrorKind {
    /// No Claude Code login on this computer.
    NoCredentials,
    /// The saved token has expired; opening Claude Code renews it.
    TokenExpired,
    /// HTTP 401: sign in again in Claude Code.
    LoginRequired,
    /// HTTP 403: the login may lack the usage scope.
    Forbidden,
    RateLimited,
    /// Proxy or connection failure; never retried without the proxy.
    Network,
    Http,
    InvalidResponse,
}

impl UsageErrorKind {
    /// Failures found before any request; retrying them costs nothing, so no backoff.
    fn is_local(self) -> bool {
        matches!(self, Self::NoCredentials | Self::TokenExpired)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct UsageError {
    pub kind: UsageErrorKind,
    /// English detail for the tooltip; never contains the token.
    pub message: String,
}

/// Mirrored by ClaudeUsage in src/features/claude-usage/api.ts. `error` is set when
/// the last refresh failed; the windows then still hold the last good numbers.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsage {
    pub five_hour: Option<UsageWindow>,
    pub seven_day: Option<UsageWindow>,
    pub source: Option<UsageSource>,
    /// When the numbers were read (Unix ms).
    pub updated_at: Option<u64>,
    pub error: Option<UsageError>,
}

/// The built-in plugin's settings.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct UsageConfig {
    /// None: HTTPS_PROXY, else http://127.0.0.1:7897.
    pub proxy: Option<String>,
    /// claude-hud's `display.externalUsageWritePath`; None skips the fallback.
    pub hud_path: Option<PathBuf>,
    /// Clamped to 5–120.
    pub interval_minutes: u64,
}

#[derive(Default)]
struct State {
    usage: ClaudeUsage,
    config: UsageConfig,
    /// Failed requests in a row, for the backoff.
    failures: u32,
    cooldown_until: Option<Instant>,
    last_request: Option<Instant>,
    in_flight: bool,
    /// Dropping it stops the poller.
    poller: Option<mpsc::Sender<()>>,
}

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// Starts polling now, or hands a running poller new settings, which apply at
/// once (new settings also clear the backoff).
#[expect(dead_code, reason = "called by the built-in plugin in stage 2")]
pub(crate) fn start(app: &AppHandle, config: UsageConfig) {
    let mut state = state();
    if state.config != config {
        state.config = config;
        state.failures = 0;
    }
    if let Some(poller) = &state.poller {
        let _ = poller.send(());
        return;
    }
    let (sender, receiver) = mpsc::channel();
    let app = app.clone();
    let spawned = thread::Builder::new()
        .name("claude-usage".into())
        .spawn(move || poll(&app, &receiver));
    match spawned {
        Ok(_) => state.poller = Some(sender),
        Err(error) => eprintln!("failed to start the Claude usage poller: {error}"),
    }
}

/// Stops polling; a request already on its way still finishes.
#[expect(dead_code, reason = "called by the built-in plugin in stage 2")]
pub(crate) fn stop() {
    state().poller = None;
}

/// Waits until the next poll is due, recomputing whenever `start` sends new
/// settings; a manual refresh also counts as the last request.
fn poll(app: &AppHandle, wake: &mpsc::Receiver<()>) {
    loop {
        let wait = wait_before_poll(&state(), Instant::now());
        if wait.is_zero() {
            tauri::async_runtime::block_on(refresh(app, false));
            continue;
        }
        if let Err(mpsc::RecvTimeoutError::Disconnected) = wake.recv_timeout(wait) {
            return;
        }
    }
}

/// The interval, doubled per failure in a row (up to an hour).
fn backoff(state: &State) -> Duration {
    let minutes = state
        .config
        .interval_minutes
        .clamp(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
    let interval = Duration::from_secs(60 * minutes);
    interval
        .saturating_mul(1 << state.failures.min(4))
        .min(MAX_BACKOFF.max(interval))
}

/// How long until the poller may ask again: the backoff since the last request,
/// and never before a 429's Retry-After. Zero before the first request.
fn wait_before_poll(state: &State, now: Instant) -> Duration {
    let Some(last) = state.last_request else {
        return Duration::ZERO;
    };
    let cooldown = state
        .cooldown_until
        .map(|until| until.saturating_duration_since(now))
        .unwrap_or_default();
    backoff(state)
        .saturating_sub(now.saturating_duration_since(last))
        .max(cooldown)
}

/// Whether a refresh may send a request now: none is running, no 429 cooldown
/// holds, and a manual refresh comes at least a minute after the last request.
fn may_request(state: &State, now: Instant, manual: bool) -> bool {
    let cooling = state.cooldown_until.is_some_and(|until| until > now);
    let recent = manual
        && state
            .last_request
            .is_some_and(|at| now.saturating_duration_since(at) < MANUAL_MIN_GAP);
    !state.in_flight && !cooling && !recent
}

async fn refresh(app: &AppHandle, manual: bool) -> ClaudeUsage {
    let now = Instant::now();
    let config = {
        let mut state = state();
        if !may_request(&state, now, manual) {
            return state.usage.clone();
        }
        state.in_flight = true;
        state.last_request = Some(now);
        state.config.clone()
    };
    let now_ms = source::unix_ms(SystemTime::now());
    let api = source::fetch_api(&source::resolve_proxy(config.proxy.as_deref()), now_ms).await;
    let hud = match (&api, config.hud_path.as_deref()) {
        (Err(_), Some(path)) => Some(source::read_hud(path)),
        _ => None,
    };
    let usage = {
        let mut state = state();
        state.in_flight = false;
        apply(&mut state, api, hud, now_ms, now);
        state.usage.clone()
    };
    let _ = app.emit(CLAUDE_USAGE_UPDATED_EVENT, &usage);
    usage
}

/// Folds one refresh into the state. After a failed API call the hud file's
/// numbers are taken only when newer than the ones shown; the API error stays
/// either way, so a refused login is never hidden.
fn apply(
    state: &mut State,
    api: Result<Limits, FetchError>,
    hud: Option<Result<(Limits, u64), String>>,
    now_ms: u64,
    now: Instant,
) {
    let error = match api {
        Ok(limits) => {
            state.failures = 0;
            state.cooldown_until = None;
            state.usage = snapshot(limits, UsageSource::Api, now_ms);
            return;
        }
        Err(error) => error,
    };
    if !error.kind.is_local() {
        state.failures = state.failures.saturating_add(1);
    }
    state.cooldown_until = error.retry_after.map(|delay| now + delay);
    if let Some(Ok((limits, written))) = hud {
        if state.usage.updated_at.is_none_or(|shown| written > shown) {
            state.usage = snapshot(limits, UsageSource::Hud, written);
        }
    }
    state.usage.error = Some(UsageError {
        kind: error.kind,
        message: error.message,
    });
}

fn snapshot(limits: Limits, source: UsageSource, updated_at: u64) -> ClaudeUsage {
    ClaudeUsage {
        five_hour: limits.five_hour,
        seven_day: limits.seven_day,
        source: Some(source),
        updated_at: Some(updated_at),
        error: None,
    }
}

/// The last snapshot, without asking anyone.
#[tauri::command]
pub fn get_claude_usage() -> Result<ClaudeUsage, String> {
    Ok(state().usage.clone())
}

/// Asks now, unless a request is running, a 429 cooldown holds, or the last
/// request was under a minute ago; then the last snapshot comes back.
#[tauri::command]
pub async fn refresh_claude_usage(app: AppHandle) -> Result<ClaudeUsage, String> {
    Ok(refresh(&app, true).await)
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::claude_usage::get_claude_usage,
            crate::claude_usage::refresh_claude_usage,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
