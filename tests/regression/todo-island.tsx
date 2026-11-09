// pnpm dev, then open /tests/regression/todo-island.html. Renders the todo page in the island style
// (Settings → Todos → Style → Island) on each of its pages, on a dark and on a light island, and
// checks the tabs, adding, ticking, starting, the archive and the row height the island grows by.
import "../../src/styles/tokens.css";
import { act, StrictMode, type ComponentProps, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { TodoIslandPage } from "../../src/features/todos/island/TodoIslandPage";
import type { TodoNotebook } from "../../src/features/todos/TodoNotebook";
import type { TodoArchive, TodoItem, TodoPageMode } from "../../src/features/todos/types";
import { TODO_ROW_HEIGHT } from "../../src/windows/island/layout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type Props = ComponentProps<typeof TodoNotebook>;
const todo = (id: string, title: string, completed = false): TodoItem => ({ id, title, completed, createdAt: 0 });
const TODOS = [
  todo("a", "评审待办页的岛屿风格"),
  todo("b", "回复 issue #31：快捷翻译在多屏下的位置，顺便把复现步骤和日志整理进任务文档里"),
  todo("c", "买咖啡豆", true),
];
const ARCHIVES: TodoArchive[] = [
  { date: "2026-11-08", todos: [todo("x", "写周报", true), todo("y", "整理桌面"), todo("z", "跑步 5 公里", true)], dailyNote: "", savedAt: 0, savedToDisk: true },
  { date: "2026-11-07", todos: [todo("p", "发版 0.3.3", true)], dailyNote: "", savedAt: 0, savedToDisk: true },
  { date: "2026-10-30", todos: [], dailyNote: "休息", savedAt: 0, savedToDisk: true },
];
const calls: string[] = [];
// Click handlers pass the event along; only the ids and values are noted.
const spy = (name: string) => (...args: unknown[]) => { calls.push([name, ...args.filter((arg) => typeof arg !== "object")].join(":")); };

function props(pageMode: TodoPageMode, extra: Partial<Props> = {}): Props {
  return {
    todos: TODOS, dailyNote: "上午评审，下午写测试。", draft: "", activeTodoId: "a", currentDate: "2026-11-09", pageMode,
    archives: ARCHIVES, archiveLayout: "cards", selectedArchive: pageMode === "review" ? ARCHIVES[0] : null, saveState: "idle",
    enableTodoReorder: true, scrollStartRows: 5, draftDate: null,
    scheduledTodos: [{ id: "s", title: "牙医复诊", date: "2026-11-12", createdAt: 0 }],
    onDraftChange: spy("draft"), onDraftDateChange: spy("date"), onAddTodo: spy("add"), onShowUpcoming: spy("upcoming"),
    onDeleteScheduledTodo: spy("deleteScheduled"), onToggleTodo: spy("toggle"), onUpdateTodo: spy("update"), onStartTodo: spy("start"),
    onDeleteTodo: spy("delete"), onReorderTodo: spy("reorder"), onSaveToday: spy("save"), onShowArchive: spy("archive"),
    onShowDaily: spy("daily"), onShowToday: spy("today"), onDailyNoteChange: spy("note"), onArchiveLayoutChange: spy("layout"),
    onSelectArchive: spy("select"),
    ...extra,
  };
}

const FRAMES: { id: string; caption: string; props: Props; light?: boolean; tall?: boolean }[] = [
  { id: "today", caption: "今天（进行中、两行、已完成）", props: props("today"), tall: true },
  { id: "empty", caption: "今天：空", props: props("today", { todos: [], activeTodoId: null, saveState: "saved" }) },
  { id: "daily", caption: "笔记", props: props("daily") },
  { id: "upcoming", caption: "已安排", props: props("upcoming") },
  { id: "archive", caption: "归档", props: props("archive") },
  { id: "review", caption: "回看某一天", props: props("review") },
  { id: "light", caption: "浅色岛屿底色", props: props("today", { saveState: "needs-path", draftDate: "2026-11-10" }), light: true, tall: true },
];

const pages = document.getElementById("pages")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

for (const frame of FRAMES) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="caption">${frame.caption}</p>`;
  const island = document.createElement("div");
  island.className = `frame${frame.light ? " frame--light" : ""}${frame.tall ? " frame--tall" : ""}`;
  island.id = `frame-${frame.id}`;
  // What stageStyle.ts sets from the island background colour.
  island.style.setProperty("--island-ink-rgb", frame.light ? "28, 27, 31" : "241, 240, 246");
  const host = document.createElement("div");
  island.append(host);
  wrap.append(island);
  pages.append(wrap);
  await act(async () => {
    createRoot(host).render(<StrictMode><I18nProvider><div style={{ height: "100%" } as CSSProperties}><TodoIslandPage {...frame.props} /></div></I18nProvider></StrictMode>);
  });
}

const $ = (frame: string, selector: string) => document.querySelector<HTMLElement>(`#frame-${frame} ${selector}`);
const $$ = (frame: string, selector: string) => [...document.querySelectorAll<HTMLElement>(`#frame-${frame} ${selector}`)];
const click = (element: HTMLElement | null) => act(async () => { element!.click(); });

try {
  const tabs = $$("today", ".todo-island__tab");
  check(tabs.map((tab) => tab.textContent).join("|") === "今天2|笔记|已安排1|归档", "四个有名字的标签页，今天和已安排带数量");
  check(tabs[0].getAttribute("aria-selected") === "true", "今天是当前标签页");
  check(!$("archive", ".todo-island__tab-count") || $$("upcoming", ".todo-island__tab").length === 4, "已安排页打开时标签一直在");
  check($$("empty", ".todo-island__tab").length === 4, "有已安排的待办时显示已安排标签");
  await click(tabs[1]);
  await click(tabs[3]);
  check(calls.includes("daily") && calls.includes("archive"), "点标签切换页面");

  const rows = $$("today", ".todo-list [data-todo-id]");
  check(rows.length === 3, "每个待办一行，带 data-todo-id（插件菜单和拖动用）");
  check(Math.abs(rows[0].getBoundingClientRect().height + 4 - TODO_ROW_HEIGHT) < 1, "一行加间距正好是岛屿按行长高的 46px");
  check(Math.abs(rows[1].getBoundingClientRect().height - rows[0].getBoundingClientRect().height - 19) < 1, "两行标题多 19px，和纸张风格一样");
  check(rows[0].classList.contains("todo-island-row--active") && $("today", ".todo-island-row__stop")?.textContent === "进行中结束", "进行中的待办有强调条和结束按钮");
  check(getComputedStyle(rows[2].querySelector(".todo-island-row__title")!).textDecorationLine === "line-through", "已完成的划掉");
  check(getComputedStyle(rows[1].querySelector(".todo-island-row__action")!).opacity === "0", "其他操作平时隐藏");
  await click(rows[1].querySelector<HTMLElement>(".todo-island-row__check"));
  await click(rows[1].querySelector<HTMLElement>(".todo-island-row__action"));
  check(calls.includes("toggle:b") && calls.includes("start:b"), "勾选和开始");

  const input = $("today", ".todo-island__composer input") as HTMLInputElement;
  check(input.placeholder === "添加待办，回车保存", "输入框提示");
  await act(async () => { input.closest("form")!.requestSubmit(); });
  check(calls.includes("add"), "回车添加");
  check(($("light", ".todo-island__composer input") as HTMLInputElement).placeholder === "添加 2026-11-10 的待办"
    && $("light", ".todo-date-picker__button--later"), "选了以后的日子：提示写日期，日期按钮变紫");
  await click($("today", ".todo-island__save"));
  check(calls.includes("save") && $("light", ".todo-island__save--needs-path")?.getAttribute("aria-label")?.includes("保存位置"), "保存按钮按状态换图标和说明");

  const text = (frame: string) => getComputedStyle($(frame, ".todo-island-row__title")!).color;
  check(text("today") !== text("light") && text("light").startsWith("rgba(28, 27, 31"), "文字颜色跟着岛屿底色：浅底深字");

  check($("empty", ".todo-island__empty")?.textContent === "今天还很轻在上面输入一件事，回车添加", "空列表有说明");
  check(($("daily", ".todo-island__note") as HTMLTextAreaElement).value === "上午评审，下午写测试。", "笔记页");
  check($("upcoming", ".scheduled-list__item")?.textContent === "牙医复诊", "已安排页沿用分日期的列表");

  const days = $$("archive", ".todo-island__archive-day");
  check($$("archive", ".todo-island__section-label").map((label) => label.textContent).join("|") === "2026年11月|2026年10月", "归档按月分组，新的在上");
  check(days.length === 3 && days[0].textContent?.includes("写") === false && days[0].textContent?.includes("整理桌面") && days[0].textContent?.includes("2/3"), "每天显示第一件没做完的和完成数");
  await click(days[1]);
  check(calls.includes("select:2026-11-07"), "点某一天打开它");
  check($("review", ".todo-island__back")?.textContent === "2026-11-08" && $("review", ".todo-island__meta")?.textContent === "完成 2/3", "回看某一天：返回按钮、日期和完成数");
  check(!$("review", ".todo-island__composer") && !$("review", ".todo-island-row__action"), "回看时只读，没有输入框和操作");
  await click($("review", ".todo-island__back"));
  check(calls.filter((call) => call === "archive").length === 2, "返回归档");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}
