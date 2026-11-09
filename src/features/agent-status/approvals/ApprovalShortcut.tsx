// The card buttons' global shortcuts all share their modifiers (Ctrl+Alt): those are written once
// at the start of the button row, and each button shows only its own key, so the row still fits.

const parts = (shortcut: string) => shortcut.split("+");

/** A button's own key, the last part of its shortcut. */
export function ApprovalShortcut({ shortcut }: { shortcut: string | undefined }) {
  if (!shortcut) return null;
  return <kbd className="agent-approval__key" aria-hidden="true">{parts(shortcut).pop()}</kbd>;
}

/** The modifiers every shortcut on the card shares, written before the buttons. */
export function ApprovalShortcutModifiers({ shortcut }: { shortcut: string | undefined }) {
  if (!shortcut || parts(shortcut).length < 2) return null;
  return <span className="agent-approval__modifiers" aria-hidden="true">{`${parts(shortcut).slice(0, -1).join("+")}+`}</span>;
}
