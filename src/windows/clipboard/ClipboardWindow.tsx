import { useCallback, useEffect, useState } from "react";
import { ClipboardPopup } from "../../features/clipboard/ClipboardPopup";
import { hideClipboardPopup, listenClipboardPopupBlur, listenClipboardPopupOpened, pasteClipboardItem } from "../../features/clipboard/api";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
import "./ClipboardWindow.css";

const NO_SHORTCUT = () => {};

/**
 * The clipboard window (C22.2), opened by the clipboard shortcut (or Win+V) unless the settings
 * keep it on the island. It stays loaded while hidden; the native side shows and places it.
 */
export function ClipboardWindow() {
  const { clipboardHistory, toggleClipboardHistoryFavorite } = useClipboardHistory(NO_SHORTCUT);
  const [openCount, setOpenCount] = useState(0);

  const close = useCallback(() => {
    void hideClipboardPopup().catch((error: unknown) => console.error("Failed to hide the clipboard window", error));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => (cancelled ? stop() : stops.push(stop));
    // The history hook keeps the entries current; opening only starts a fresh search.
    void listenClipboardPopupOpened(() => setOpenCount((count) => count + 1)).then(keep);
    // Clicking elsewhere closes it, like Windows' own clipboard history.
    void listenClipboardPopupBlur(close).then(keep);
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [close]);

  return (
    <ClipboardPopup
      items={clipboardHistory.items}
      openCount={openCount}
      onPaste={(id, plain) => void pasteClipboardItem(id, plain).catch((error: unknown) => console.error("Failed to paste a clipboard entry", error))}
      onClose={close}
      onToggleFavorite={(id) => void toggleClipboardHistoryFavorite(id)}
    />
  );
}
