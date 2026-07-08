import chokidar from "chokidar";
import { streamSSE } from "hono/streaming";
import { projectRoot } from "./paths.js";
const watchers = new Map();
const subscribers = new Map();
function getSubscribers(project) {
    let set = subscribers.get(project);
    if (!set) {
        set = new Set();
        subscribers.set(project, set);
    }
    return set;
}
function ensureWatcher(project) {
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
        const payload = { type, path: relative.replaceAll("\\", "/") };
        for (const listener of getSubscribers(project)) {
            listener(payload);
        }
    });
    watchers.set(project, watcher);
    return watcher;
}
export function createWatchHandler(project) {
    ensureWatcher(project);
    return (c) => streamSSE(c, async (stream) => {
        const listener = (event) => {
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
        await new Promise((resolve) => {
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
export async function closeAllWatchers() {
    await Promise.all([...watchers.values()].map((watcher) => watcher.close()));
    watchers.clear();
    subscribers.clear();
}
