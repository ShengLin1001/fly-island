//! Reading what is on the clipboard into a capture, and writing entries back (with retries while
//! another program holds the clipboard).

use arboard::{Clipboard, ImageData};
use image::RgbaImage;
use std::{
    borrow::Cow,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use super::store::{hash_bytes, preview_text};

const CLIPBOARD_WRITE_RETRY_ATTEMPTS: usize = 8;

const CLIPBOARD_WRITE_RETRY_DELAY: Duration = Duration::from_millis(35);

pub(super) enum ClipboardCapture {
    Text {
        hash: String,
        text: String,
        preview: String,
        /// The same text as HTML, when the program that copied it gave one (C24.4).
        html: Option<String>,
    },
    /// Files copied in Explorer (CF_HDROP), C24.3.
    Files {
        hash: String,
        paths: Vec<String>,
        preview: String,
    },
    Image {
        hash: String,
        width: usize,
        height: usize,
        rgba: Vec<u8>,
    },
}

impl ClipboardCapture {
    pub(super) fn hash(&self) -> &str {
        match self {
            Self::Text { hash, .. } | Self::Files { hash, .. } | Self::Image { hash, .. } => hash,
        }
    }
}

/// What to read besides text: the capture settings.
#[derive(Clone, Copy)]
pub(super) struct CaptureKinds {
    pub(super) images: bool,
    pub(super) files: bool,
    pub(super) html: bool,
}

/// One line for a list of files: the first name, and how many more.
pub(super) fn files_preview(paths: &[String]) -> String {
    let first = paths
        .first()
        .and_then(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    match paths.len() {
        0 | 1 => first,
        count => format!("{first} +{}", count - 1),
    }
}

pub(super) fn read_clipboard_capture(kinds: CaptureKinds) -> Result<Option<ClipboardCapture>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;

    // Files first: Explorer puts no text next to them, but some programs add the paths as text.
    if kinds.files {
        if let Ok(paths) = clipboard.get().file_list() {
            let paths: Vec<String> = paths.iter().map(|path: &PathBuf| path.display().to_string()).collect();
            if !paths.is_empty() {
                let hash = hash_bytes([b"files:".as_slice(), paths.join("\n").as_bytes()].concat().as_slice());
                return Ok(Some(ClipboardCapture::Files { hash, preview: files_preview(&paths), paths }));
            }
        }
    }

    if let Ok(text) = clipboard.get_text() {
        if !text.trim().is_empty() {
            let hash = hash_bytes([b"text:", text.as_bytes()].concat().as_slice());
            let html = if kinds.html { clipboard.get().html().ok().filter(|html| !html.trim().is_empty()) } else { None };
            return Ok(Some(ClipboardCapture::Text {
                hash,
                preview: preview_text(&text),
                text,
                html,
            }));
        }
    }

    if kinds.images {
        if let Ok(image) = clipboard.get_image() {
            let mut hash_input = Vec::with_capacity(16 + image.bytes.len());
            hash_input.extend_from_slice(&image.width.to_le_bytes());
            hash_input.extend_from_slice(&image.height.to_le_bytes());
            hash_input.extend_from_slice(&image.bytes);
            let hash = hash_bytes(&hash_input);

            return Ok(Some(ClipboardCapture::Image {
                hash,
                width: image.width,
                height: image.height,
                rgba: image.bytes.into_owned(),
            }));
        }
    }

    Ok(None)
}

pub(super) fn write_clipboard_text(text: &str) -> Result<(), String> {
    retry_clipboard_write("set clipboard text", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set_text(text.to_owned())
            .map_err(|error| format!("Failed to set clipboard text: {error}"))
    })
}

/// Rich text with its plain text beside it, so programs without HTML still get the words (C24.4).
pub(super) fn write_clipboard_html(html: &str, text: &str) -> Result<(), String> {
    retry_clipboard_write("set clipboard html", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set_html(html.to_owned(), Some(text.to_owned()))
            .map_err(|error| format!("Failed to set clipboard html: {error}"))
    })
}

/// Files, as Explorer copies them (C24.3).
pub(super) fn write_clipboard_files(paths: &[String]) -> Result<(), String> {
    retry_clipboard_write("set clipboard files", || {
        let mut clipboard = Clipboard::new().map_err(|error| format!("Failed to open clipboard: {error}"))?;
        clipboard.clear().map_err(|error| format!("Failed to clear clipboard: {error}"))?;
        clipboard
            .set()
            .file_list(paths)
            .map_err(|error| format!("Failed to set clipboard files: {error}"))
    })
}

/// Adds the file to what is on the clipboard (CF_HDROP next to the bitmap and PNG): chat apps and
/// Explorer paste the file, image editors the bitmap.
pub(super) fn write_clipboard_file(path: &Path) -> Result<(), String> {
    retry_clipboard_write("set clipboard file", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set()
            .file_list(&[path])
            .map_err(|error| format!("Failed to set clipboard file: {error}"))
    })
}

/// The path in double quotes, as a terminal's drag and drop gives it; spaces stay one argument.
pub(super) fn quoted_path(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

#[cfg(test)]
#[test]
fn image_paths_are_quoted_and_copy_forms_parse() {
    assert_eq!(quoted_path(Path::new(r"C:\Users\a b\clip.png")), r#""C:\Users\a b\clip.png""#);
    use super::CopyAs;
    let forms: Vec<CopyAs> = serde_json::from_str(r#"["original","file","path"]"#).expect("parses");
    assert_eq!(forms, [CopyAs::Original, CopyAs::File, CopyAs::Path]);
}

pub(super) fn write_clipboard_image(width: usize, height: usize, image: &RgbaImage) -> Result<(), String> {
    retry_clipboard_write("set clipboard image", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set_image(ImageData {
                width,
                height,
                bytes: Cow::Owned(image.as_raw().clone()),
            })
            .map_err(|error| format!("Failed to set clipboard image: {error}"))
    })
}

fn retry_clipboard_write(
    action: &str,
    mut write: impl FnMut() -> Result<(), String>,
) -> Result<(), String> {
    let mut last_error = None;

    for attempt in 0..CLIPBOARD_WRITE_RETRY_ATTEMPTS {
        match write() {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);

                if attempt + 1 < CLIPBOARD_WRITE_RETRY_ATTEMPTS {
                    thread::sleep(CLIPBOARD_WRITE_RETRY_DELAY);
                }
            }
        }
    }

    Err(format!(
        "Failed to {action} after {CLIPBOARD_WRITE_RETRY_ATTEMPTS} attempts: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

