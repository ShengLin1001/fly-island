// The page side of the system monitor. The page cannot read the system itself: main.ps1
// sends a { type: "sample" } every second while the page is open, and this script keeps
// five minutes of history for the charts. getState / setState keep them while the
// island runs, so the charts are not empty when the page opens again. With background
// recording on, main.ps1 also sends { type: "history" }, the five minutes before the page opened.
// Program icons arrive once per program (sample.processes.icons) and are kept here.
const focusd = acquireFocusdApi();
const chinese = focusd.locale === "zh-CN";
const HISTORY = 300;
const text = chinese
  ? { memory: "内存", processes: "程序", byMemory: "内存", reading: "正在读取…", vram: "显存", power: "显卡功耗", down: "下载", up: "上传", battery: "电池", charging: "充电中", count: (n) => `${n} 个进程` }
  : { memory: "Memory", processes: "Programs", byMemory: "Memory", reading: "Reading…", vram: "VRAM", power: "GPU power", down: "Download", up: "Upload", battery: "Battery", charging: "charging", count: (n) => (n === 1 ? "1 process" : `${n} processes`) };

const $ = (id) => document.getElementById(id);
const ns = "http://www.w3.org/2000/svg";
$("processes-label").textContent = text.processes;
$("sort-memory").textContent = text.byMemory;
$("down-label").setAttribute("aria-label", text.down);
$("up-label").setAttribute("aria-label", text.up);
$("waiting").textContent = text.reading;

const saved = focusd.getState() || {};
const history = { cpu: [], gpu: [], down: [], up: [], ...(saved.history || {}) };
let sortBy = saved.sortBy === "memory" ? "memory" : "cpu";
let processes = saved.processes || null;
const icons = saved.icons || {};
let last = null;

const save = () => focusd.setState({ history, sortBy, processes, icons, last });

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
  const arc = svg.children[1];
  const length = 2 * Math.PI * 11.5;
  arc.setAttribute("stroke-dasharray", String(length));
  arc.setAttribute("stroke-dashoffset", String(length * (1 - clampPercent(value ?? 0) / 100)));
  svg.setAttribute("class", `ring ring--${level(value ?? 0, warm, hot)}`);
}

/** Five minutes of samples, right-aligned so the newest sits at the right edge. */
function spark(svg, values, max) {
  const [, , width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
  if (values.length === 0) {
    svg.replaceChildren();
    return;
  }
  const step = width / (HISTORY - 1);
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

function showCores(cores) {
  const box = $("cores");
  while (box.children.length < cores.length) {
    const core = element("span", "cores__core");
    core.append(document.createElement("span"));
    box.append(core);
  }
  while (box.children.length > cores.length) box.lastElementChild.remove();
  cores.forEach((value, index) => {
    box.children[index].firstElementChild.style.height = `${Math.max(6, clampPercent(value))}%`;
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
  const rows = processes ? (sortBy === "cpu" ? processes.byCpu : processes.byMemory) : [];
  $("processes").replaceChildren(
    ...rows.map((program) => {
      const item = document.createElement("li");
      const name = element("span", "processes__name", program.name);
      if (program.count > 1) {
        const count = element("span", "processes__count", `×${program.count}`);
        count.setAttribute("aria-label", text.count(program.count));
        name.append(count);
      }
      const value = sortBy === "cpu" ? `${Number(program.cpu).toFixed(1)}%` : bytes(program.memory, true);
      item.title = `${program.name} · CPU ${Number(program.cpu).toFixed(1)}% · ${bytes(program.memory)}`;
      item.append(programIcon(program.name), name, element("span", "processes__figure", value));
      return item;
    }),
  );
  for (const button of $("sort").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.sort === sortBy));
}

/** VRAM, GPU power and the battery, whichever this computer has; the line hides when none. */
function showExtra(sample) {
  const gpu = sample.gpu;
  const parts = [];
  if (gpu && gpu.memoryUsed != null && gpu.memoryTotal != null) {
    parts.push([text.vram, `${(gpu.memoryUsed / 1024).toFixed(1)} / ${(gpu.memoryTotal / 1024).toFixed(1)} GB`]);
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

  figure($("cpu"), String(Math.round(clampPercent(sample.cpu))), "%");
  $("cpu-extra").textContent = ["CPU", sample.cpuTemperature != null ? degree(sample.cpuTemperature) : null].filter(Boolean).join(" · ");
  ring($("cpu-ring"), sample.cpu, "C", 70, 90);
  spark($("cpu-spark"), history.cpu, 100);
  showCores(sample.cores || []);

  const gpu = sample.gpu;
  if (gpu && gpu.usage != null) figure($("gpu"), String(Math.round(clampPercent(gpu.usage))), "%");
  else $("gpu").textContent = "—";
  const gpuName = gpu && gpu.name ? gpu.name.replace(/^NVIDIA (GeForce )?/, "") : "GPU";
  $("gpu-extra").textContent = [gpuName, gpu && gpu.temperature != null ? degree(gpu.temperature) : null].filter(Boolean).join(" · ");
  ring($("gpu-ring"), gpu ? gpu.usage : 0, "G", 70, 90);
  spark($("gpu-spark"), history.gpu, 100);

  const memoryShare = sample.memoryTotal > 0 ? (sample.memoryUsed / sample.memoryTotal) * 100 : 0;
  ring($("memory-ring"), memoryShare, "M", 70, 90);
  const meter = $("memory-meter");
  meter.className = `meter meter--${level(memoryShare, 70, 90)}`;
  meter.firstElementChild.style.width = `${clampPercent(memoryShare)}%`;
  const memory = $("memory");
  memory.replaceChildren(
    document.createTextNode((sample.memoryUsed / 1024 ** 3).toFixed(1)),
    element("small", null, ` / ${Number((sample.memoryTotal / 1024 ** 3).toFixed(1))} GB`),
  );
  memory.setAttribute("aria-label", `${text.memory} ${(sample.memoryUsed / 1024 ** 3).toFixed(1)} / ${(sample.memoryTotal / 1024 ** 3).toFixed(1)} GB`);

  // Download and upload share one scale so they compare at a glance.
  const rateMax = Math.max(64 * 1024, ...history.down, ...history.up);
  $("download").textContent = `${bytes(sample.download)}/s`;
  $("upload").textContent = `${bytes(sample.upload)}/s`;
  spark($("down-spark"), history.down, rateMax);
  spark($("up-spark"), history.up, rateMax);

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
  last = message;
  show(message);
  save();
});

if (saved.last) {
  last = saved.last;
  show(saved.last);
}
// Icons the page already has, so main.ps1 does not send them again after a restart of the page.
focusd.postMessage({ type: "ready", icons: Object.keys(icons) });
