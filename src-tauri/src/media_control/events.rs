//! Tells the island the moment a player changes track or plays / pauses, from the media
//! sessions' own events. Players that report no position (NetEase Cloud Music) are timed by the
//! island (src/features/media/trackClock.ts); with only the 1.5 s state poll, each track start,
//! pause and resume was found up to 1.5 s late and the lyrics drifted by that much.

use serde::Serialize;
use std::{
    collections::HashMap,
    sync::mpsc::{self, Sender},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use windows::{
    Foundation::TypedEventHandler,
    Media::Control::{
        GlobalSystemMediaTransportControlsSession as MediaSession,
        GlobalSystemMediaTransportControlsSessionManager as MediaSessionManager,
    },
};

use super::audio::{read_system_audio_peak, AUDIO_ACTIVE_THRESHOLD};
use super::session::{current_unix_millis, media_error, request_manager, session_id};
use crate::win32;

// Mirrored by MEDIA_SESSION_CHANGED_EVENT in src/features/media/api.ts. The payload is a
// SessionChange.
pub(crate) const MEDIA_SESSION_CHANGED_EVENT: &str = "media-session-changed";

// A new track starts after the old one goes quiet: NetEase Cloud Music announced the next track
// about 0.4 s before its sound (measured). Not quiet this soon after the change means the tracks
// run into each other, and the change is the start.
const QUIET_GRACE: Duration = Duration::from_millis(300);
// Silent this long after the change (paused, or still buffering), the change is the start.
const SOUND_WAIT: Duration = Duration::from_millis(2000);
const SOUND_STEP: Duration = Duration::from_millis(15);

/// Mirrored by MediaSessionChange in src/features/media/api.ts.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionChange {
    /// "track": another song started (`at` is when its sound began); "playback": it played or paused.
    kind: &'static str,
    /// Unix milliseconds.
    at: i64,
    session_id: Option<String>,
}

enum Signal {
    Sessions,
    Track(Option<String>, i64),
    Playback(Option<String>, i64),
}

struct Watched {
    id: Option<String>,
    session: MediaSession,
    properties_token: i64,
    playback_token: i64,
}

pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        if let Err(error) = watch(&app) {
            eprintln!("media session events are off, the 1.5 s poll stays: {error}");
        }
    });
}

fn watch(app: &AppHandle) -> Result<(), String> {
    let _apartment = win32::com::ComApartment::multithreaded()
        .map_err(|error| media_error("Failed to initialize the media events thread", error))?;
    let manager = request_manager()?;
    let (sender, signals) = mpsc::channel();
    let to_thread = sender.clone();
    manager
        .SessionsChanged(&TypedEventHandler::new(move |_, _| {
            let _ = to_thread.send(Signal::Sessions);
            Ok(())
        }))
        .map_err(|error| media_error("Failed to watch the media sessions", error))?;

    // The song each session last announced, so a change of cover or album alone is no new track.
    let mut songs: HashMap<Option<String>, String> = HashMap::new();
    let mut watched = Vec::new();
    let mut resubscribe = true;
    loop {
        if resubscribe {
            resubscribe = false;
            unsubscribe(&watched);
            watched = subscribe(&manager, &sender);
            for entry in &watched {
                songs.entry(entry.id.clone()).or_insert_with(|| song(&entry.session));
            }
        }
        let Ok(signal) = signals.recv() else {
            return Ok(());
        };
        match signal {
            Signal::Sessions => resubscribe = true,
            Signal::Playback(id, at) => emit(app, "playback", at, id),
            Signal::Track(id, at) => {
                let Some(entry) = watched.iter().find(|entry| entry.id == id) else { continue };
                let now = song(&entry.session);
                if songs.get(&id) == Some(&now) {
                    continue;
                }
                songs.insert(id.clone(), now);
                emit(app, "track", sound_onset(at), id);
            }
        }
    }
}

fn subscribe(manager: &MediaSessionManager, sender: &Sender<Signal>) -> Vec<Watched> {
    let Ok(sessions) = manager.GetSessions() else { return Vec::new() };
    sessions
        .into_iter()
        .filter_map(|session| {
            let id = session_id(&session);
            let (tx, track_id) = (sender.clone(), id.clone());
            let properties_token = session
                .MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = tx.send(Signal::Track(track_id.clone(), current_unix_millis()));
                    Ok(())
                }))
                .ok()?;
            let (tx, playback_id) = (sender.clone(), id.clone());
            let playback_token = session
                .PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = tx.send(Signal::Playback(playback_id.clone(), current_unix_millis()));
                    Ok(())
                }))
                .ok()?;
            Some(Watched { id, session, properties_token, playback_token })
        })
        .collect()
}

fn unsubscribe(watched: &[Watched]) {
    for entry in watched {
        let _ = entry.session.RemoveMediaPropertiesChanged(entry.properties_token);
        let _ = entry.session.RemovePlaybackInfoChanged(entry.playback_token);
    }
}

fn song(session: &MediaSession) -> String {
    let Ok(operation) = session.TryGetMediaPropertiesAsync() else { return String::new() };
    let Ok(properties) = pollster::block_on(operation) else { return String::new() };
    let title = properties.Title().map(|value| value.to_string()).unwrap_or_default();
    let artist = properties.Artist().map(|value| value.to_string()).unwrap_or_default();
    format!("{title}\u{1f}{artist}")
}

/// When the new track's sound began: the first sound after the old one went quiet.
fn sound_onset(changed_at: i64) -> i64 {
    let started = Instant::now();
    let mut quiet = false;
    while started.elapsed() < SOUND_WAIT {
        // Unreadable counts as sound, so the change stands as the start.
        let loud = read_system_audio_peak().map_or(true, |peak| peak > AUDIO_ACTIVE_THRESHOLD);
        if !loud {
            quiet = true;
        } else if quiet {
            return current_unix_millis();
        } else if started.elapsed() > QUIET_GRACE {
            return changed_at;
        }
        thread::sleep(SOUND_STEP);
    }
    changed_at
}

fn emit(app: &AppHandle, kind: &'static str, at: i64, session_id: Option<String>) {
    let _ = app.emit(MEDIA_SESSION_CHANGED_EVENT, SessionChange { kind, at, session_id });
}
