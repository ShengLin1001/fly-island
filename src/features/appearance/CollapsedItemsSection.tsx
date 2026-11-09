import { useMemo } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import { shownUsageProviders, usageItemId } from "../claude-usage/usageRing";
import { pluginStatusItemId } from "../plugin-views/usePluginStatusItems";
import { usePluginStatusItemList } from "../plugin-views/usePluginViews";
import { useBuiltinPlugin } from "../plugins/useBuiltinPlugin";
import {
  arrangeCollapsedItems,
  moveCollapsedItem,
  setCollapsedItemHidden,
  setCollapsedItemZone,
  type CollapsedPlacement,
  type CollapsedZone,
} from "./collapsedItems";
import { useCollapsedPlacements } from "./useCollapsedPlacements";
import "../plugin-views/PluginIslandPagesSection.css";
import "./CollapsedItemsSection.css";

const CLAUDE_USAGE_PLUGIN_ID = "focusd.claude-usage";

/**
 * Appearance → the icons on the collapsed bar: left and right of the summary, in
 * order, each movable to the other side or hidden (C12, issue #17). Lists every
 * item the bar can show here, also the ones with nothing to show right now.
 */
export function CollapsedItemsSection() {
  const t = useTranslation();
  const { locale } = useLocale();
  const text = t.settings.collapsedItems;
  const { placements: saved, save } = useCollapsedPlacements();
  const usage = useBuiltinPlugin(CLAUDE_USAGE_PLUGIN_ID);
  const declared = usePluginStatusItemList();

  const names = useMemo(() => {
    const entries: [string, string][] = [
      ["status-light", text.item.statusLight],
      ["mail", text.item.mail],
      ["update", text.item.update],
    ];
    for (const item of declared) {
      const several = declared.filter((other) => other.pluginId === item.pluginId).length > 1;
      const plugin = item.pluginName[locale];
      entries.push([pluginStatusItemId(item.pluginId, item.itemId), several ? `${plugin} · ${item.itemId}` : plugin]);
    }
    entries.push(["device-use", text.item.deviceUse], ["shelf", text.item.shelf], ["music", text.item.music]);
    if (usage.enabled) {
      for (const provider of shownUsageProviders(usage.settings)) entries.push([usageItemId(provider), text.item.usage(provider.name)]);
    }
    entries.push(["session-count", text.item.sessionCount]);
    return new Map(entries);
  }, [declared, locale, text, usage.enabled, usage.settings]);

  const listed = useMemo(() => [...names.keys()], [names]);
  const placements = useMemo(() => arrangeCollapsedItems(listed, saved), [listed, saved]);
  const change = (next: CollapsedPlacement[]) => save(next);

  const zone = (name: CollapsedZone) => {
    const rows = placements.filter((placement) => placement.zone === name && names.has(placement.id));
    return (
      <div className="collapsed-items__zone" role="group" aria-label={name === "left" ? text.left : text.right}>
        <h4 className="collapsed-items__zone-title">{name === "left" ? text.left : text.right}</h4>
        {rows.length === 0 ? <p className="settings-section__hint">{text.empty}</p> : null}
        <ul className="plugin-pages">
          {rows.map((placement, index) => {
            const label = names.get(placement.id) ?? placement.id;
            return (
              <li className="plugin-pages__row collapsed-items__row" key={placement.id}>
                <span className="collapsed-items__number" aria-hidden="true">{index + 1}</span>
                <span className="plugin-pages__name"><strong>{label}</strong></span>
                <button className="plugin-card__button" type="button" disabled={index === 0} aria-label={text.moveUp(label)} onClick={() => change(moveCollapsedItem(placements, placement.id, -1, listed))}>
                  <ArrowUp size={12} strokeWidth={2.4} />
                </button>
                <button className="plugin-card__button" type="button" disabled={index === rows.length - 1} aria-label={text.moveDown(label)} onClick={() => change(moveCollapsedItem(placements, placement.id, 1, listed))}>
                  <ArrowDown size={12} strokeWidth={2.4} />
                </button>
                <button
                  className="plugin-card__button"
                  type="button"
                  aria-label={name === "left" ? text.toRight(label) : text.toLeft(label)}
                  onClick={() => change(setCollapsedItemZone(placements, placement.id, name === "left" ? "right" : "left"))}
                >
                  <ArrowLeftRight size={12} strokeWidth={2.4} />
                </button>
                <ToggleControl label={text.show} checked={!placement.hidden} onChange={(show) => change(setCollapsedItemHidden(placements, placement.id, !show))} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <div className="collapsed-items">
        {zone("left")}
        {zone("right")}
        <button className="plugin-card__button collapsed-items__reset" type="button" disabled={saved.length === 0} onClick={() => save([])}>
          {text.reset}
        </button>
      </div>
    </SettingsGroup>
  );
}
