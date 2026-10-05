import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

// 監視はプロジェクトのフォルダ(絶対パス)単位で共有する
const watchers = new Map<string, FSWatcher>();
const subscribers = new Map<string, Set<(event: WatchEvent) => void>>();

export interface WatchEvent {
  type: "change" | "add" | "unlink";
  path: string;
}

function getSubscribers(root: string): Set<(event: WatchEvent) => void> {
  let set = subscribers.get(root);
  if (!set) {
    set = new Set();
    subscribers.set(root, set);
  }
  return set;
}

function ensureWatcher(root: string): FSWatcher {
  const existing = watchers.get(root);
  if (existing) {
    return existing;
  }

  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignored: [/(^|[/\\])\../, /[/\\]dist[/\\]/, /[/\\]\.auth[/\\]/],
  });

  watcher.on("all", (eventName, path) => {
    const relative = path.startsWith(root) ? path.slice(root.length + 1) : path;
    const type = eventName === "add" ? "add" : eventName === "unlink" ? "unlink" : "change";
    const payload: WatchEvent = { type, path: relative.replaceAll("\\", "/") };
    for (const listener of getSubscribers(root)) {
      listener(payload);
    }
  });

  watchers.set(root, watcher);
  return watcher;
}

/**
 * プロジェクトのファイル変更を SSE で通知する。
 * root は呼び出し側で検査済み(存在するプロジェクトのフォルダ)であること
 */
export function createWatchHandler(project: string, root: string) {
  ensureWatcher(root);
  return (c: Context) =>
    streamSSE(c, async (stream) => {
      const listener = (event: WatchEvent) => {
        void stream.writeSSE({
          event: "file",
          data: JSON.stringify(event),
        });
      };
      const set = getSubscribers(root);
      set.add(listener);

      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ project }),
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          set.delete(listener);
          if (set.size === 0) {
            const watcher = watchers.get(root);
            void watcher?.close();
            watchers.delete(root);
            subscribers.delete(root);
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
