import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { arrangeCollapsedItems, isCollapsedItemHidden, setCollapsedItemHidden } from "../appearance/collapsedItems";
import { useCollapsedPlacements } from "../appearance/useCollapsedPlacements";
import { useTranslation } from "../../i18n";

const MUSIC_ITEM = "music";

/**
 * Settings → Music → Island: whether the collapsed bar shows the music wave. It is the "music"
 * item's hidden flag of the collapsed bar's layout (Appearance → Collapsed bar), so the two
 * switches stay one; the island follows through the storage event.
 */
export function MusicBarSettingsSection() {
  const text = useTranslation().settings.musicBar;
  const { placements, save } = useCollapsedPlacements();
  const shown = !isCollapsedItemHidden(placements, MUSIC_ITEM);

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow
        title={text.wave}
        description={text.waveHint}
        checked={shown}
        // A layout never arranged has no "music" entry yet; give it its default place first.
        onChange={(show) => save(setCollapsedItemHidden(arrangeCollapsedItems([MUSIC_ITEM], placements), MUSIC_ITEM, !show))}
      />
    </SettingsGroup>
  );
}
