//! The message banner's rectangle below the collapsed island (roadmap C10). The stage window lets
//! clicks fall through everywhere outside the island shape; while a banner shows, the front end
//! hands its rectangle here so the banner takes clicks and hovers too. It is kept apart from the
//! island shape so that resting on the banner never counts as hovering the island (which would
//! open it).

use serde::Deserialize;
use std::sync::{Mutex, PoisonError};

// Mirrored by ISLAND_BANNER_HOVER_CHANGED_EVENT in src/windows/island/api.ts. The payload says
// whether the cursor is over the banner; sent by the passthrough loop, for the same reason as
// island-hover-changed: the page misses mouseleave once the window stops taking the cursor.
pub(crate) const ISLAND_BANNER_HOVER_CHANGED_EVENT: &str = "island-banner-hover-changed";

/// A rectangle in the stage window's CSS pixels, as `getBoundingClientRect` gives it.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct BannerRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl BannerRect {
    pub(super) fn contains(self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }

    fn is_usable(self) -> bool {
        [self.x, self.y, self.width, self.height].iter().all(|value| value.is_finite())
            && self.width > 0.0
            && self.height > 0.0
    }
}

static BANNER_RECT: Mutex<Option<BannerRect>> = Mutex::new(None);

/// Sets the banner's rectangle while it shows, and clears it (`null`) when it goes.
#[tauri::command]
pub fn set_island_banner_rect(rect: Option<BannerRect>) {
    *BANNER_RECT.lock().unwrap_or_else(PoisonError::into_inner) = rect.filter(|rect| rect.is_usable());
}

pub(super) fn banner_rect() -> Option<BannerRect> {
    *BANNER_RECT.lock().unwrap_or_else(PoisonError::into_inner)
}
