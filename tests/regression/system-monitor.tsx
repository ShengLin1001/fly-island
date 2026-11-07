// pnpm dev, then open /tests/regression/system-monitor.html. Renders the system monitor page with
// the native sampler mocked: a busy machine with an NVIDIA card and a battery, then one without.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import type { SystemStats } from "../../src/features/system-monitor/api";
import { SystemMonitorPanel } from "../../src/features/system-monitor/SystemMonitorPanel";
import { SYSTEM_EXPANDED_ISLAND_HEIGHT } from "../../src/windows/island/layout";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
// The island's header and padding around a page, as in agent-sessions.tsx.
const ISLAND_CHROME_HEIGHT = 86;
const GB = 1024 ** 3;
const program = (name: string, cpu: number, memory: number, count = 1) => ({ name, cpu, memory, count });
const BUSY: SystemStats = {
  cpu: 37.6,
  cores: [12, 80, 33, 5, 61, 97, 20, 44, 9, 15, 70, 28],
  cpuTemperature: 67.4,
  memoryUsed: 12.4 * GB,
  memoryTotal: 16 * GB,
  download: 2_150_400,
  upload: 96_000,
  battery: { percent: 83, pluggedIn: true },
  gpu: { name: "NVIDIA GeForce GTX 1050 Ti", usage: 42, temperature: 61, memoryUsed: 1300, memoryTotal: 4096, power: null },
  byCpu: [program("chrome", 14.2, 2.1 * GB, 23), program("Code", 8.9, 1.4 * GB, 11), program("一个名字特别特别特别长的后台同步服务进程OneDriveStandaloneUpdaterBackgroundTask", 3.1, 0.2 * GB), program("claude", 2.5, 0.4 * GB, 3), program("dwm", 1.2, 0.1 * GB)],
  byMemory: [program("chrome", 14.2, 2.1 * GB, 23), program("Code", 8.9, 1.4 * GB, 11), program("MsMpEng", 0.4, 0.5 * GB), program("claude", 2.5, 0.4 * GB, 3), program("explorer", 0.3, 0.2 * GB)],
};
let next: SystemStats = BUSY;
let reads = 0;
mockIPC((command) => {
  if (command === "get_system_stats") {
    reads += 1;
    return next;
  }
  return null;
});

const results = document.getElementById("results")!;
const fixture = document.getElementById("panel")!;
fixture.style.height = `${SYSTEM_EXPANDED_ISLAND_HEIGHT - ISLAND_CHROME_HEIGHT}px`;
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const text = (selector: string) => document.querySelector(selector)?.textContent;

try {
  const root = createRoot(fixture);
  await act(async () => { root.render(<StrictMode><I18nProvider><SystemMonitorPanel /></I18nProvider></StrictMode>); });
  await wait(60);
  check(text(".system-card--cpu .system-card__value") === "38%" && document.querySelectorAll(".system-cores__core").length === 12 && text(".system-card--cpu .system-card__extra") === "67°C", "CPU 卡片写出总占用、温度，每个核心一根小柱");
  check(text(".system-card--gpu .system-card__value") === "42%" && text(".system-card--gpu .system-card__extra") === "61°C", "GPU 卡片写出占用和温度");
  check(text(".system-card__name") === "GTX 1050 Ti" && text(".system-card__foot")?.includes("显存 1.3 / 4 GB"), `显卡名去掉厂商前缀，写出显存：${text(".system-card__foot")}`);
  check(text(".system-row__value") === "12.4 / 16 GB" && document.querySelector(".system-meter--medium"), `内存写出已用和总量，过七成变橙：${text(".system-row__value")}`);
  check(text(".system-net__item--down .system-net__rate") === "2.1 MB/s" && text(".system-net__battery") === "83%", "写出下载速度和电池电量");
  check(document.querySelector(".system-net__battery")?.getAttribute("aria-label") === "电池 83% · 充电中", "电池的读屏文字说明在充电");
  const names = () => [...document.querySelectorAll(".system-processes__name")].map((name) => name.textContent);
  check(names().join() === "chrome,Code,一个名字特别特别特别长的后台同步服务进程OneDriveStandaloneUpdaterBackgroundTask,claude,dwm" && text(".system-processes__count") === "×23", "默认按 CPU 排程序，同名进程写出个数");
  const longName = document.querySelectorAll<HTMLElement>(".system-processes__name")[2];
  check(longName.scrollWidth > longName.clientWidth, "长程序名单行省略");
  const memoryButton = [...document.querySelectorAll<HTMLButtonElement>(".system-processes__toggle button")].find((button) => button.textContent === "内存")!;
  await act(async () => { memoryButton.click(); });
  check(names()[2] === "MsMpEng" && memoryButton.getAttribute("aria-pressed") === "true", "切到内存后按内存排");
  const panel = document.querySelector<HTMLElement>(".system-monitor")!;
  check(panel.scrollHeight <= panel.clientHeight && panel.scrollWidth <= panel.clientWidth, `整页放得下，不滚动也不横向溢出：${panel.scrollHeight} / ${panel.clientHeight}`);
  check(document.querySelectorAll("[title]").length === 0, "不弹悬停提示");
  await wait(1100);
  const points = () => document.querySelector(".system-spark--cpu .system-spark__line")?.getAttribute("points")?.split(" ").length ?? 0;
  check(points() >= 2, `每秒读一次，曲线每次多一个点：${points()}`);

  next = { ...BUSY, gpu: null, battery: null, cpuTemperature: null, memoryUsed: 15.2 * GB };
  await wait(1100);
  check(text(".system-card--gpu .system-card__value") === "—" && !document.querySelector(".system-net__battery") && !document.querySelector(".system-card--cpu .system-card__extra"), "没有 NVIDIA 显卡、电池和热区时 GPU 写 —，不显示电池和 CPU 温度");
  check(document.querySelector(".system-meter--high"), "内存过九成变红");
  root.unmount();
  const after = reads;
  await wait(1200);
  check(reads === after, "离开这一页就不再读");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
