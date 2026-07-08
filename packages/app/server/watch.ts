import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { projectRoot } from "./paths.js";

const watchers = new Map<string, FSWatcher>();
const subscribers = new Map<string, Set<(event: WatchEvent) => void>>();

export interface WatchEvent {
  type: "change" | "add" | "unlink";
  path: string;
}

function getSubscribers(project: string): Set<(event: WatchEvent) => void> {
  let set = subscribers.get(project);
  if (!set) {
    set = new Set();
    subscribers.set(project, set);
  }
  return set;
}

function ensureWatcher(project: string): FSWatcher {
  const existing = watchers.get(project);
  if (existing) {
    return existing;
  }

  const watcher = chokidar.watch(projectRoot(project), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignored: [/(^|[/\\])\../, /[/\\]dist[/\\]/, /[/\\]\.auth[/\\]/],
  });

  watcher.on("all", (eventName, path) => {
    const root = projectRoot(project);
    const relative = path.startsWith(root) ? path.slice(root.length + 1) : path;
    const type = eventName === "add" ? "add" : eventName === "unlink" ? "unlink" : "change";
    const payload: WatchEvent = { type, path: relative.replaceAll("\\", "/") };
    for (const listener of getSubscribers(project)) {
      listener(payload);
    }
  });

  watchers.set(project, watcher);
  return watcher;
}

export function createWatchHandler(project: string) {
  ensureWatcher(project);
  return (c: Context) =>
    streamSSE(c, async (stream) => {
      const listener = (event: WatchEvent) => {
        void stream.writeSSE({
          event: "file",
          data: JSON.stringify(event),
        });
      };
      const set = getSubscribers(project);
      set.add(listener);

      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ project }),
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          set.delete(listener);
          if (set.size === 0) {
            const watcher = watchers.get(project);
            void watcher?.close();
            watchers.delete(project);
            subscribers.delete(project);
          }
          resolve();
        });
      });
    });
}

export async function closeAllWatchers(): Promise<void> {
  await Promise.all([...watchers.values()].map((watcher) => watcher.close()));
  watchers.clear();
  subscribers.clear();
}
