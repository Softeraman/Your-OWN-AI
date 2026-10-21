import seed from "../seed.json";
import { createStore } from "./store.js";
import { createModels } from "./models.js";
import { createLocalEngine } from "./local-engine.js";
const progress = (data) => self.postMessage({ type: "progress", ...data });
const engine = createLocalEngine({
  store: createStore(),
  models: createModels(progress),
  seed,
  progress,
});
self.onmessage = async (event) => {
  const { id, path, body, method } = event.data;
  try {
    const result = await engine.request(path, body, method);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: `${error.message}. If a model download failed, check your connection and retry.`,
    });
  } finally {
    self.postMessage({ type: "progress", label: "" });
  }
};
