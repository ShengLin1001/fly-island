export type SystemMonitorText = {
  title: string;
  memory: string;
  download: string;
  upload: string;
  battery: string;
  charging: string;
  processes: string;
  byCpu: string;
  byMemory: string;
  videoMemory: string;
  reading: string;
  failed: (reason: string) => string;
  /** "chrome ×12": how many processes one program runs. */
  processCount: (count: number) => string;
};

export const zhCN: SystemMonitorText = {
  title: "系统监控",
  memory: "内存",
  download: "下载",
  upload: "上传",
  battery: "电池",
  charging: "充电中",
  processes: "进程",
  byCpu: "CPU",
  byMemory: "内存",
  videoMemory: "显存",
  reading: "正在读取…",
  failed: (reason) => `读取失败：${reason}`,
  processCount: (count) => `${count} 个进程`,
};

export const en: SystemMonitorText = {
  title: "System monitor",
  memory: "Memory",
  download: "Down",
  upload: "Up",
  battery: "Battery",
  charging: "Charging",
  processes: "Processes",
  byCpu: "CPU",
  byMemory: "Memory",
  videoMemory: "VRAM",
  reading: "Reading…",
  failed: (reason) => `Could not read: ${reason}`,
  processCount: (count) => (count === 1 ? "1 process" : `${count} processes`),
};
