import { generateAndUploadTileset, updateSampledGeoJSON } from "./tileset-generator";

interface ScheduledTask {
  name: string;
  interval: number;
  lastRun: Date | null;
  nextRun: Date;
  enabled: boolean;
  handler: () => Promise<void>;
}

const tasks: Map<string, ScheduledTask> = new Map();
let isRunning = false;

export function registerScheduledTask(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>,
  enabled: boolean = true
) {
  const now = new Date();
  tasks.set(name, {
    name,
    interval: intervalMs,
    lastRun: null,
    nextRun: new Date(now.getTime() + intervalMs),
    enabled,
    handler
  });
  console.log(`[Scheduler] Registered task: ${name} (every ${intervalMs / 1000 / 60 / 60}h)`);
}

async function runTaskIfDue(task: ScheduledTask): Promise<void> {
  const now = new Date();
  
  if (!task.enabled || now < task.nextRun) {
    return;
  }
  
  console.log(`[Scheduler] Running task: ${task.name}`);
  task.lastRun = now;
  task.nextRun = new Date(now.getTime() + task.interval);
  
  try {
    await task.handler();
    console.log(`[Scheduler] Completed task: ${task.name}`);
  } catch (error) {
    console.error(`[Scheduler] Task failed: ${task.name}`, error);
  }
}

export function startScheduler() {
  if (isRunning) {
    console.log("[Scheduler] Already running");
    return;
  }
  
  isRunning = true;
  console.log("[Scheduler] Starting scheduled task runner...");
  
  setInterval(async () => {
    const taskList = Array.from(tasks.values());
    for (const task of taskList) {
      await runTaskIfDue(task);
    }
  }, 60 * 1000);
}

export function getScheduledTasks() {
  return Array.from(tasks.values()).map(t => ({
    name: t.name,
    interval: t.interval,
    lastRun: t.lastRun?.toISOString() || null,
    nextRun: t.nextRun.toISOString(),
    enabled: t.enabled
  }));
}

export function setTaskEnabled(name: string, enabled: boolean) {
  const task = tasks.get(name);
  if (task) {
    task.enabled = enabled;
    console.log(`[Scheduler] Task ${name} ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export function runTaskNow(name: string): Promise<void> {
  const task = tasks.get(name);
  if (!task) {
    return Promise.reject(new Error(`Task not found: ${name}`));
  }
  
  console.log(`[Scheduler] Manually running task: ${name}`);
  return task.handler();
}

export function initializeScheduledTasks() {
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_WEEK = 7 * 24 * ONE_HOUR;
  
  registerScheduledTask(
    "tileset-update",
    ONE_WEEK,
    async () => {
      const result = await generateAndUploadTileset();
      if (result.success) {
        console.log(`[Scheduler] Tileset updated: ${result.churchCount} churches`);
      } else {
        console.error(`[Scheduler] Tileset update failed: ${result.error}`);
      }
    },
    true
  );
  
  registerScheduledTask(
    "sampled-geojson-update", 
    ONE_WEEK,
    async () => {
      const result = await updateSampledGeoJSON();
      if (result.success) {
        console.log(`[Scheduler] Sampled GeoJSON updated: ${result.count} churches`);
      }
    },
    true
  );
  
  startScheduler();
  console.log("[Scheduler] Initialized with default tasks");
}
