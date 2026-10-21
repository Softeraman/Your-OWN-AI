let worker,
  counter = 0;
const pending = new Map();
export const isLocalEngine = (base) => base === "browser";
export function localRequest(path, body, method) {
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === "progress") {
        window.dispatchEvent(new CustomEvent("vdb-progress", { detail: data }));
        return;
      }
      const callbacks = pending.get(data.id);
      if (callbacks) {
        pending.delete(data.id);
        if (data.error) callbacks.reject(new Error(data.error));
        else callbacks.resolve(data.result);
      }
    };
    worker.onerror = () => {
      for (const c of pending.values())
        c.reject(
          new Error(
            "The browser AI worker stopped. Your saved documents are safe. Reload and try again.",
          ),
        );
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, { resolve, reject });
    worker.postMessage({
      id,
      path,
      body,
      method: method || (body ? "POST" : "GET"),
    });
  });
}
