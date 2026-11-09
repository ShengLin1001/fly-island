//! Reading the text in an image with Windows' own OCR (Windows.Media.Ocr), on this computer
//! (C24.9). The engine follows the user's display languages, so Chinese and English both work
//! when those language packs are there.

use windows::{
    Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Storage::Streams::DataWriter,
};

use super::com::WinRtApartment;

/// The text in an RGBA image, one line per recognised line; `None` when Windows has no OCR
/// language, the image is too large for it, or nothing was found.
pub(crate) fn recognize(width: u32, height: u32, rgba: &[u8]) -> Option<String> {
    let _apartment = WinRtApartment::multithreaded().ok()?;
    let max = OcrEngine::MaxImageDimension().ok()?;
    if width == 0 || height == 0 || width > max || height > max || rgba.len() != (width * height * 4) as usize {
        return None;
    }
    // SoftwareBitmap wants BGRA.
    let mut bgra = rgba.to_vec();
    for pixel in bgra.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }
    let writer = DataWriter::new().ok()?;
    writer.WriteBytes(&bgra).ok()?;
    let buffer = writer.DetachBuffer().ok()?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        width as i32,
        height as i32,
        BitmapAlphaMode::Premultiplied,
    )
    .ok()?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok()?;
    let result = engine.RecognizeAsync(&bitmap).ok()?.get().ok()?;
    let lines: Vec<String> = result
        .Lines()
        .ok()?
        .into_iter()
        .filter_map(|line| line.Text().ok())
        .map(|text| join_cjk(&text.to_string_lossy()))
        .filter(|line| !line.trim().is_empty())
        .collect();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

fn is_cjk(c: char) -> bool {
    matches!(c, '\u{3000}'..='\u{303F}' | '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7AF}' | '\u{FF00}'..='\u{FFEF}')
}

/// Windows' OCR puts a space between every Chinese character ("你 好 世 界"); drops the spaces
/// that have CJK text on both sides and keeps the others.
pub(crate) fn join_cjk(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut joined = String::with_capacity(line.len());
    for (index, &c) in chars.iter().enumerate() {
        if c == ' ' {
            let before = index.checked_sub(1).and_then(|i| chars.get(i)).copied();
            let after = chars.get(index + 1).copied();
            if before.is_some_and(is_cjk) && after.is_some_and(is_cjk) {
                continue;
            }
        }
        joined.push(c);
    }
    joined
}

#[cfg(test)]
mod tests {
    use super::join_cjk;

    #[test]
    fn spaces_between_chinese_characters_go() {
        assert_eq!(join_cjk("你 好 世 界"), "你好世界");
        assert_eq!(join_cjk("发 票 Invoice 2026 年"), "发票 Invoice 2026 年");
        assert_eq!(join_cjk("hello world"), "hello world");
    }
}
