// The page side of the system monitor. The page cannot read the system itself: main.ps1
// sends a { type: "sample" } every second while the page is open, and this script keeps
// five minutes of history for the charts. getState / setState keep them while the
// island runs, so the charts are not empty when the page opens again (the state is capped at
// 64 KB, so program icons stay out of it: main.ps1 sends them again for each opening). With
// background recording on, main.ps1 also sends { type: "history" }, the five minutes before
// the page opened.
const focusd = acquireFocusdApi();
const chinese = focusd.locale === "zh-CN";
const HISTORY = 300;
const PROGRAM_ROWS = 6;
const text = chinese
  ? {
      memory: "内存", processes: "程序", byMemory: "内存", reading: "正在读取…", vram: "显存", power: "显卡功耗", down: "下载", up: "上传",
      battery: "电池", charging: "充电中", taskManager: "打开任务管理器", engines: { "3d": "3D", copy: "复制", decode: "解码", encode: "编码" },
      count: (n) => `${n} 个进程`, recent: (average, peak, unit) => `最近 5 分钟：平均 ${average}${unit}，最高 ${peak}${unit}`,
    }
  : {
      memory: "Memory", processes: "Programs", byMemory: "Memory", reading: "Reading…", vram: "VRAM", power: "GPU power", down: "Download", up: "Upload",
      battery: "Battery", charging: "charging", taskManager: "Open Task Manager", engines: { "3d": "3D", copy: "Copy", decode: "Decode", encode: "Encode" },
      count: (n) => (n === 1 ? "1 process" : `${n} processes`), recent: (average, peak, unit) => `Last 5 minutes: average ${average}${unit}, peak ${peak}${unit}`,
    };

const $ = (id) => document.getElementById(id);
const ns = "http://www.w3.org/2000/svg";
$("processes-label").textContent = text.processes;
$("sort-memory").textContent = text.byMemory;
$("down-label").setAttribute("aria-label", text.down);
$("up-label").setAttribute("aria-label", text.up);
$("waiting").textContent = text.reading;
$("task-manager").setAttribute("aria-label", text.taskManager);
$("task-manager").title = text.taskManager;

const saved = focusd.getState() || {};
const history = { cpu: [], gpu: [], down: [], up: [], ...(saved.history || {}) };
let sortBy = saved.sortBy === "memory" ? "memory" : "cpu";
let processes = saved.processes || null;
const icons = {};
let last = null;
let shownPrograms = "";

const save = () => focusd.setState({ history, sortBy, processes, last });

function push(values, value) {
  values.push(value);
  if (values.length > HISTORY) values.splice(0, values.length - HISTORY);
}

function bytes(value, short = false) {
  const units = short ? ["B", "K", "M", "G", "T"] : ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const number = value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1);
  return short ? `${number}${units[index]}` : `${number} ${units[index]}`;
}

const clampPercent = (value) => Math.min(100, Math.max(0, value));
const level = (value, warm, hot) => (value >= hot ? "hot" : value >= warm ? "warm" : "normal");
const element = (tag, className, content) => Object.assign(document.createElement(tag), className ? { className } : {}, content != null ? { textContent: content } : {});

/** A number with a smaller unit after it: "28" "%". */
function figure(target, number, unit) {
  target.replaceChildren(document.createTextNode(number), element("small", null, unit));
}

/** "Last 5 minutes: average 12%, peak 48%", for the hover on a chart. */
function recent(values, format, unit) {
  if (values.length === 0) return "";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return text.recent(format(average), format(Math.max(...values)), unit);
}

/** A small ring filled to `value` percent with a letter in the middle. */
function ring(svg, value, letter, warm = 101, hot = 101) {
  if (!svg.firstChild) {
    const track = document.createElementNS(ns, "circle");
    const arc = document.createElementNS(ns, "circle");
    const label = document.createElementNS(ns, "text");
    for (const circle of [track, arc]) {
      circle.setAttribute("cx", "14");
      circle.setAttribute("cy", "14");
      circle.setAttribute("r", "11.5");
    }
    track.setAttribute("class", "ring__track");
    arc.setAttribute("class", "ring__arc");
    arc.setAttribute("transform", "rotate(-90 14 14)");
    label.setAttribute("class", "ring__label");
    label.setAttribute("x", "14");
    label.setAttribute("y", "14");
    label.textContent = letter;
    svg.append(track, arc, label);
  }
  const share = clampPercent(value ?? 0);
  const arc = svg.children[1];
  const length = 2 * Math.PI * 11.5;
  arc.setAttribute("stroke-dasharray", String(length));
  arc.setAttribute("stroke-dashoffset", String(length * (1 - share / 100)));
  svg.setAttribute("class", `ring ring--${level(share, warm, hot)}${share < 0.5 ? " ring--empty" : ""}`);
}

/**
 * Up to five minutes of samples, right-aligned so the newest sits at the right edge. The chart
 * spans at least a minute and grows to five as samples come in, so a page just opened does not
 * show a sliver at the right end.
 */
function spark(svg, values, max) {
  const [, , width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
  if (values.length === 0) {
    svg.replaceChildren();
    return;
  }
  const step = width / (Math.min(HISTORY, Math.max(60, values.length)) - 1);
  const start = width - step * (values.length - 1);
  const points = values.map((value, index) => `${(start + index * step).toFixed(1)},${(height - (Math.min(value, max) / max) * height).toFixed(1)}`);
  const fill = document.createElementNS(ns, "polygon");
  fill.setAttribute("class", "spark__fill");
  fill.setAttribute("points", `${points.join(" ")} ${width},${height} ${start.toFixed(1)},${height}`);
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("class", "spark__line");
  line.setAttribute("points", points.join(" "));
  svg.replaceChildren(fill, line);
}

/** Bars that keep their elements and only change height. */
function bars(box, values, make) {
  while (box.children.length < values.length) box.append(make(box.children.length));
  while (box.children.length > values.length) box.lastElementChild.remove();
  return [...box.children];
}

function showCores(cores) {
  const box = $("cores");
  // Many cores share the same width: narrower gaps keep every bar visible.
  box.style.setProperty("--core-gap", cores.length > 32 ? "1px" : cores.length > 16 ? "2px" : "3px");
  bars(box, cores, () => {
    const core = element("span", "cores__core");
    core.append(document.createElement("span"));
    return core;
  }).forEach((core, index) => {
    core.firstElementChild.style.height = `${Math.max(6, clampPercent(cores[index]))}%`;
  });
}

function showEngines(engines) {
  const box = $("engines");
  box.hidden = engines.length === 0;
  bars(box, engines, () => {
    const engine = element("span", "engine");
    const bar = element("span", "engine__bar");
    bar.append(document.createElement("span"));
    engine.append(bar, element("span", "engine__name"));
    return engine;
  }).forEach((engine, index) => {
    const { id, value } = engines[index];
    const name = text.engines[id] || id;
    engine.lastElementChild.textContent = name;
    engine.firstElementChild.firstElementChild.style.height = `${clampPercent(value)}%`;
    engine.title = `${name} ${Math.round(value)}%`;
  });
}

function programIcon(name) {
  if (icons[name]) {
    const image = element("img", "processes__icon");
    image.src = icons[name];
    image.alt = "";
    return image;
  }
  const initial = element("span", "processes__initial", name.slice(0, 1));
  initial.setAttribute("aria-hidden", "true");
  return initial;
}

function showProcesses() {
  const rows = processes ? (sortBy === "cpu" ? processes.byCpu : processes.byMemory) : null;
  // The same rows as last time: nothing to draw (the list updates every 3 s, the page every second).
  const key = JSON.stringify([sortBy, rows, Object.keys(icons).length]);
  if (key === shownPrograms) return;
  shownPrograms = key;
  for (const button of $("sort").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.sort === sortBy));
  if (!rows) {
    $("processes").replaceChildren(...Array.from({ length: PROGRAM_ROWS }, () => element("li", "processes__placeholder")));
    return;
  }
  $("processes").replaceChildren(
    ...rows.slice(0, PROGRAM_ROWS).map((program) => {
      const item = document.createElement("li");
      const name = element("span", "processes__name", program.name);
      if (program.count > 1) {
        const count = element("span", "processes__count", `×${program.count}`);
        count.setAttribute("aria-label", text.count(program.count));
        name.append(count);
      }
      const cpu = Number(program.cpu);
      const value = sortBy === "cpu" ? `${cpu.toFixed(1)}%` : bytes(program.memory, true);
      // A program over a fifth of the whole machine stands out.
      const hot = sortBy === "cpu" ? cpu >= 20 : last && last.memoryTotal > 0 && program.memory / last.memoryTotal >= 0.2;
      item.title = `${program.name} · CPU ${cpu.toFixed(1)}% · ${bytes(program.memory)}`;
      item.append(programIcon(program.name), name, element("span", `processes__figure${hot ? " processes__figure--hot" : ""}`, value));
      return item;
    }),
  );
}

/** VRAM, GPU power and the battery, whichever this computer has; the line hides when none. */
function showExtra(sample) {
  const gpu = sample.gpu;
  const parts = [];
  if (gpu && gpu.memoryUsed != null) {
    const used = (gpu.memoryUsed / 1024).toFixed(1);
    parts.push([text.vram, gpu.memoryTotal != null ? `${used} / ${(gpu.memoryTotal / 1024).toFixed(1)} GB` : `${used} GB`]);
  }
  if (gpu && gpu.power != null) parts.push([text.power, `${Math.round(gpu.power)} W`]);
  if (sample.battery) parts.push([text.battery, `${sample.battery.charging ? "⚡" : ""}${sample.battery.percent}%`]);
  const extra = $("extra");
  extra.hidden = parts.length === 0;
  extra.replaceChildren(
    ...parts.map(([label, value]) => {
      const part = element("span", null, `${label} `);
      part.append(element("strong", null, value));
      return part;
    }),
  );
}

function show(sample) {
  $("monitor").hidden = false;
  $("waiting").hidden = true;
  const degree = (value) => `${Math.round(value)}°C`;
  const whole = (value) => String(Math.round(value));

  const cpu = clampPercent(sample.cpu);
  figure($("cpu"), whole(cpu), "%");
  $("cpu-extra").textContent = ["CPU", sample.cpuTemperature != null ? degree(sample.cpuTemperature) : null].filter(Boolean).join(" · ");
  ring($("cpu-ring"), cpu, "C", 70, 90);
  spark($("cpu-spark"), history.cpu, 100);
  $("cpu-unit").title = recent(history.cpu, whole, "%");
  $("cpu-unit").setAttribute("aria-label", `CPU ${whole(cpu)}%`);
  showCores(sample.cores || []);

  const gpu = sample.gpu;
  $("monitor").classList.toggle("monitor--no-gpu", !gpu);
  $("gpu-unit").hidden = !gpu;
  if (gpu) {
    if (gpu.usage != null) figure($("gpu"), whole(clampPercent(gpu.usage)), "%");
    else $("gpu").textContent = "—";
    const name = gpu.name ? gpu.name.replace(/^(NVIDIA|AMD|Intel\(R\)) (GeForce |Radeon\(TM\) |Radeon |Arc\(TM\) )?/, "") : "GPU";
    $("gpu-extra").textContent = [name, gpu.temperature != null ? degree(gpu.temperature) : null].filter(Boolean).join(" · ");
    $("gpu-extra").title = gpu.name || "";
    ring($("gpu-ring"), gpu.usage, "G", 70, 90);
    spark($("gpu-spark"), history.gpu, 100);
    $("gpu-unit").title = recent(history.gpu, whole, "%");
    $("gpu-unit").setAttribute("aria-label", `GPU ${gpu.usage != null ? `${whole(gpu.usage)}%` : "—"}`);
    showEngines(gpu.engines || []);
  }

  const memoryShare = sample.memoryTotal > 0 ? (sample.memoryUsed / sample.memoryTotal) * 100 : 0;
  ring($("memory-ring"), memoryShare, "M", 70, 90);
  const meter = $("memory-meter");
  meter.className = `meter meter--${level(memoryShare, 70, 90)}`;
  meter.firstElementChild.style.width = `${clampPercent(memoryShare)}%`;
  const used = (sample.memoryUsed / 1024 ** 3).toFixed(1);
  const total = Number((sample.memoryTotal / 1024 ** 3).toFixed(1));
  $("memory").replaceChildren(document.createTextNode(used), element("small", null, ` / ${total} GB`));
  $("memory-percent").textContent = `${Math.round(memoryShare)}%`;
  $("memory-line").setAttribute("aria-label", `${text.memory} ${used} / ${total} GB, ${Math.round(memoryShare)}%`);

  // Download and upload share one scale so they compare at a glance.
  const rateMax = Math.max(64 * 1024, ...history.down, ...history.up);
  const rate = (value) => bytes(value);
  $("download").textContent = `${rate(sample.download)}/s`;
  $("upload").textContent = `${rate(sample.upload)}/s`;
  spark($("down-spark"), history.down, rateMax);
  spark($("up-spark"), history.up, rateMax);
  $("down-item").title = recent(history.down, rate, "/s");
  $("up-item").title = recent(history.up, rate, "/s");

  showExtra(sample);
  showProcesses();
}

$("sort").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sort]");
  if (!button) return;
  sortBy = button.dataset.sort;
  showProcesses();
  save();
});

$("task-manager").addEventListener("click", () => focusd.postMessage({ type: "taskManager" }));

focusd.onMessage((message) => {
  if (message && message.type === "history") {
    for (const key of Object.keys(history)) if (Array.isArray(message[key])) history[key] = message[key].slice(-HISTORY);
    if (last) show(last);
    save();
    return;
  }
  if (!message || message.type !== "sample") return;
  push(history.cpu, message.cpu);
  push(history.gpu, message.gpu && message.gpu.usage != null ? message.gpu.usage : 0);
  push(history.down, message.download);
  push(history.up, message.upload);
  if (message.processes) {
    Object.assign(icons, message.processes.icons || {});
    processes = { byCpu: message.processes.byCpu, byMemory: message.processes.byMemory };
  }
  // Kept for the next opening without the programs (and their icons), which processes holds.
  last = { ...message, processes: undefined };
  show(last);
  save();
});

if (saved.last) {
  last = saved.last;
  show(saved.last);
}
// The page starts without icons (they are not saved), so main.ps1 sends all it has.
focusd.postMessage({ type: "ready", icons: Object.keys(icons) });
