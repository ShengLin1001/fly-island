// pnpm dev, then open /tests/regression/ssh-tunnel.html. The SSH proxy tunnel's plugin page
// (Settings → Plugins → SSH proxy tunnel) against an in-memory native side: the custom local port
// shows only with "Custom port" picked, hosts list their tunnel states and export line, a bad
// server port is refused, and a port the server already uses asks first (yes / no).
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/features/plugins/PluginCard.css";
import "../../src/windows/settings/LayoutEditor.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { PluginDetailPage } from "../../src/features/plugins/PluginDetailPage";
import type { PluginInfo } from "../../src/features/plugins/api";
import type { SshTunnelHost } from "../../src/features/ssh-tunnel/api";

const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
window.addEventListener("beforeunload", () => {
  if (savedLocale === null) localStorage.removeItem(LOCALE_STORAGE_KEY);
  else localStorage.setItem(LOCALE_STORAGE_KEY, savedLocale);
});
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });

const off = (host: string, remotePort: number | null = null): SshTunnelHost => ({ host, enabled: false, remotePort, state: "off", error: null });
let hosts: SshTunnelHost[] = [
  { host: "zcm6", enabled: true, remotePort: 10089, state: "connected", error: null },
  off("a6", 20089),
  off("lab"),
  { host: "nas", enabled: true, remotePort: 30089, state: "error", error: "ssh exited with 255: Permission denied (publickey)." },
  { host: "gpu", enabled: true, remotePort: 37897, state: "portInUse", error: null },
  { host: "old", enabled: true, remotePort: 40089, state: "off", error: null },
];
const takenPorts = new Set([10089]);
const calls: { command: string; args: Record<string, unknown> }[] = [];
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  switch (command) {
    case "get_ssh_tunnels": return hosts;
    case "check_ssh_tunnel_port": return takenPorts.has(args.remotePort as number);
    case "set_ssh_tunnel": {
      const { host, enabled, remotePort } = args as { host: string; enabled: boolean; remotePort: number | null };
      hosts = hosts.map((entry) => entry.host === host ? { ...entry, enabled, remotePort, state: enabled ? "connecting" : "off" } : entry);
      return hosts;
    }
    default: throw new Error(`Unexpected command ${command}`);
  }
});

const settingsSchema: PluginInfo["settingsSchema"] = [
  { key: "localProxy", type: "select", title: { "zh-CN": "本地代理", en: "Local proxy" }, default: "clash-verge", options: [
    { value: "clash-verge", title: { "zh-CN": "Clash Verge（7897）", en: "Clash Verge (7897)" } },
    { value: "v2rayn", title: { "zh-CN": "v2rayN（10808）", en: "v2rayN (10808)" } },
    { value: "custom", title: { "zh-CN": "自定义端口", en: "Custom port" } },
  ] },
  { key: "customPort", type: "number", title: { "zh-CN": "本地端口", en: "Local port" }, min: 1, max: 65535, default: 7897 },
];
const plugin = (localProxy: string): PluginInfo => ({
  id: "focusd.ssh-proxy-tunnel", builtin: true, dev: false, invalidReason: null,
  name: { "zh-CN": "SSH 代理隧道", en: "SSH proxy tunnel" }, description: null, version: "1.0.0", author: "ShengLin1001", homepage: "",
  permissions: [], optionalPermissions: [], calls: [], commands: [], runtime: "builtin", hasProcess: true, enabled: true, needsApproval: false,
  status: "running", error: null, log: [], settingsSchema, settings: { localProxy, customPort: 7897 }, info: [], notificationsMuted: false,
  keybindingConflicts: [], keybindings: {}, sensitive: {}, activation: "startup", activationEvents: [], startupMs: null, resources: null,
  keepAlive: null, revoked: null, updateAvailable: null, signingKeyChanged: false, authorKey: null, autoUpdated: null, preRelease: false,
  preReleaseAvailable: null, memoryLimitMb: 512,
});

const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const page = document.getElementById("page")!;
const root = createRoot(page);
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const noop = () => undefined;
const render = async (localProxy: string) => {
  await act(async () => {
    root.render(
      <StrictMode><I18nProvider>
        <PluginDetailPage plugin={plugin(localProxy)} busy={false} onBack={noop} onSettingChange={noop} onRunCommand={noop}
          onNotificationsMutedChange={noop} onPreReleaseChange={noop} onMemoryLimitChange={noop} onClearData={noop} onRevokeSensitive={noop} />
      </I18nProvider></StrictMode>,
    );
  });
  await settle();
};
const row = (host: string) => [...page.querySelectorAll<HTMLElement>(".ssh-tunnel__host")].find((found) => found.querySelector("label")?.textContent === host)!;
const state = (host: string) => row(host).querySelector(".ssh-tunnel__state")?.textContent ?? "";
const flip = async (host: string) => { await act(async () => { row(host).querySelector<HTMLInputElement>("[role='switch']")!.click(); }); await settle(); };
const typePort = async (host: string, value: string) => {
  const input = row(host).querySelector<HTMLInputElement>(".ssh-tunnel__port")!;
  await act(async () => { input.value = value; input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await settle();
};
const dialog = () => page.querySelector<HTMLElement>("[role='alertdialog']");
const answer = async (text: string) => {
  await act(async () => { [...dialog()!.querySelectorAll("button")].find((button) => button.textContent === text)!.click(); });
  await settle();
};
const lastSet = () => calls.filter((call) => call.command === "set_ssh_tunnel").slice(-1)[0]?.args;

try {
  await render("clash-verge");
  check(page.textContent?.includes("本地代理") && !page.textContent.includes("本地端口"), "The local port field stays hidden until Custom port is picked");
  await render("custom");
  check(page.textContent?.includes("本地端口"), "Picking Custom port shows the local port field");

  check(state("zcm6") === "已连接" && row("zcm6").querySelector("code")?.textContent
    === "export http_proxy=http://127.0.0.1:10089 https_proxy=http://127.0.0.1:10089 HTTPS_PROXY=http://127.0.0.1:10089",
  "A connected host says so and offers the export line for the server");
  check(state("gpu") === "端口被占用，等待中", "A host whose port the server refused waits for it");
  check(state("nas").includes("连接失败") && state("nas").includes("Permission denied"), "A failed host shows why");
  check(state("old") === "插件开启后连接", "A host switched on while the plugin is off says it waits for the plugin");
  check(state("lab") === "先填服务器端口" && !row("lab").querySelector("code"), "A host without a port asks for one and has no export line");

  await flip("a6");
  check(lastSet()?.host === "a6" && lastSet()?.enabled === true && lastSet()?.remotePort === 20089 && !dialog(),
    "Switching on a host whose port is free there sets the tunnel up without asking");

  const setsBefore = calls.filter((call) => call.command === "set_ssh_tunnel").length;
  await typePort("lab", "80");
  check(state("lab") === "端口要是 1024–65535 的整数" && calls.filter((call) => call.command === "set_ssh_tunnel").length === setsBefore,
    "A server port below 1024 is refused and not saved");

  await typePort("lab", "10089");
  check(lastSet()?.host === "lab" && lastSet()?.enabled === false && lastSet()?.remotePort === 10089, "A port typed on a host that is off is saved, still off");
  await flip("lab");
  check(dialog()?.textContent?.includes("lab 上的端口 10089 已被占用（可能是另一个隧道），仍要搭建隧道吗？"), "Switching on a host whose port is taken there asks first");
  await answer("否");
  check(!dialog() && lastSet()?.enabled === false && !row("lab").querySelector<HTMLInputElement>("[role='switch']")!.checked, "No leaves the host off");
  await flip("lab");
  await answer("是");
  check(!dialog() && lastSet()?.host === "lab" && lastSet()?.enabled === true && lastSet()?.remotePort === 10089, "Yes sets the tunnel up anyway");

  await typePort("zcm6", "10089");
  check(lastSet()?.host === "lab", "Leaving a host's port as it was saves nothing");

  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  messages.push(`FAIL ${String(error)}`);
  console.error(error);
} finally {
  document.getElementById("results")!.textContent = messages.join("\n");
}
