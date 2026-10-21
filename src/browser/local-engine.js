import { createIndexes, chunkText } from "./vector-index.js";
export function createLocalEngine({
  store,
  models,
  seed,
  progress = () => {},
}) {
  let state,
    indexes = new Map(),
    queue = Promise.resolve();
  const init = async () => {
    if (!state) {
      state = (await store.load()) || {
        vectors: seed,
        documents: [],
        nextVectorId: Math.max(0, ...seed.map((x) => x.id)) + 1,
        nextDocId: 1,
      };
    }
    return state;
  };
  const mutate = async (fn) => {
    const draft = structuredClone(state),
      value = fn(draft);
    await store.save(draft);
    state = draft;
    indexes.clear();
    return value;
  };
  const index = (rows, metric, key) => {
    if (!indexes.has(key)) indexes.set(key, createIndexes(rows, metric));
    return indexes.get(key);
  };
  const raw = async (path, body, method = "GET") => {
    await init();
    const url = new URL(path, "https://browser.local"),
      p = url.pathname,
      metric = url.searchParams.get("metric") || "cosine",
      k = Math.max(
        1,
        Math.min(100, Number(body?.k || url.searchParams.get("k")) || 5),
      );
    if (p === "/status")
      return {
        runtime: "browser",
        ollamaAvailable: false,
        embedModel: "all-MiniLM-L6-v2 (384D)",
        genModel: "SmolLM2-135M · on-device",
        docCount: state.documents.length,
        docDims: 384,
        demoDims: 16,
        demoCount: state.vectors.length,
      };
    if (p === "/stats")
      return {
        count: state.vectors.length,
        dims: 16,
        algorithms: ["hnsw", "kdtree", "bruteforce"],
        metrics: ["cosine", "euclidean", "manhattan"],
      };
    if (p === "/items") return structuredClone(state.vectors);
    if (p === "/insert") {
      if (
        !body.metadata?.trim() ||
        body.embedding?.length !== 16 ||
        body.embedding.some((x) => !Number.isFinite(x))
      )
        throw new Error("A label and 16 finite dimensions are required.");
      return mutate((draft) => {
        const id = draft.nextVectorId++;
        draft.vectors.push({ ...body, id });
        return { id };
      });
    }
    if (p.startsWith("/delete/") && method === "DELETE")
      return mutate((draft) => {
        const id = Number(p.split("/").at(-1)),
          before = draft.vectors.length;
        draft.vectors = draft.vectors.filter((v) => v.id !== id);
        return { ok: before !== draft.vectors.length };
      });
    if (p === "/search" || p === "/benchmark") {
      const q = (url.searchParams.get("v") || "").split(",").map(Number);
      if (q.length !== 16 || q.some((x) => !Number.isFinite(x)))
        throw new Error("Search needs a valid 16D vector.");
      const idx = index(state.vectors, metric, "vectors:" + metric);
      if (p === "/search") {
        const algo = url.searchParams.get("algo") || "hnsw",
          start = performance.now(),
          hits = idx.search(q, k, algo);
        return {
          results: hits.map((h) => ({ ...h.item, distance: h.distance })),
          latencyUs: (performance.now() - start) * 1000,
          algo,
          metric,
        };
      }
      const timings = {};
      for (const [algo, key] of [
        ["hnsw", "hnswUs"],
        ["kdtree", "kdtreeUs"],
        ["bruteforce", "bruteforceUs"],
      ]) {
        idx.search(q, k, algo);
        const start = performance.now();
        for (let i = 0; i < 30; i++) idx.search(q, k, algo);
        timings[key] = Number(
          (((performance.now() - start) * 1000) / 30).toFixed(2),
        );
      }
      return {
        ...timings,
        itemCount: state.vectors.length,
        runtime: "browser",
      };
    }
    if (p === "/hnsw-info")
      return index(state.vectors, "cosine", "vectors:cosine").info();
    if (p === "/doc/list")
      return state.documents.map(({ id, title, text }) => ({
        id,
        title,
        preview: text.slice(0, 120) + (text.length > 120 ? "…" : ""),
        words: text.split(/\s+/).length,
      }));
    if (p === "/doc/insert") {
      if (!body.title?.trim() || !body.text?.trim())
        throw new Error("Enter a title and document text.");
      if (body.text.length > 50000)
        throw new Error(
          "Add up to 50,000 characters at a time. Split larger documents into sections.",
        );
      const chunks = chunkText(body.text),
        pending = [];
      for (let i = 0; i < chunks.length; i++) {
        progress({
          label: `Embedding document chunk ${i + 1} of ${chunks.length}…`,
        });
        pending.push({
          title:
            chunks.length > 1
              ? `${body.title} [${i + 1}/${chunks.length}]`
              : body.title,
          text: chunks[i],
          embedding: await models.embed(chunks[i]),
        });
      }
      return mutate((draft) => {
        const ids = pending.map((doc) => {
          const id = draft.nextDocId++;
          draft.documents.push({ ...doc, id });
          return id;
        });
        return { ids, chunks: ids.length, dims: 384 };
      });
    }
    if (p.startsWith("/doc/delete/") && method === "DELETE")
      return mutate((draft) => {
        const id = Number(p.split("/").at(-1)),
          before = draft.documents.length;
        draft.documents = draft.documents.filter((x) => x.id !== id);
        return { ok: before !== draft.documents.length };
      });
    if (p === "/doc/ask" || p === "/doc/search") {
      if (!body.question?.trim()) throw new Error("Enter a question.");
      if (!state.documents.length)
        throw new Error("Add a document before asking a question.");
      progress({ label: "Finding relevant document chunks…" });
      const q = await models.embed(body.question);
      const hits = index(state.documents, "cosine", "documents").search(
        q,
        k,
        "hnsw",
      );
      const contexts = hits.map((h) => ({ ...h.item, distance: h.distance }));
      if (p === "/doc/search") return { contexts };
      const answer = await models.generate(body.question, contexts);
      return {
        answer,
        model: "SmolLM2-135M · on-device",
        contexts: contexts.map(({ embedding, ...c }) => c),
        docCount: state.documents.length,
      };
    }
    throw new Error("Unsupported local engine operation: " + p);
  };
  return {
    request(path, body, method) {
      const result = queue.then(() => raw(path, body, method));
      queue = result.catch(() => {});
      return result;
    },
  };
}
