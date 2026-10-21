import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createIndexes, chunkText } from "../src/browser/vector-index.js";
import { createLocalEngine } from "../src/browser/local-engine.js";
import { embed, search } from "../src/engine.js";
const seed = JSON.parse(
  readFileSync(new URL("../src/seed.json", import.meta.url)),
);
test("KD-Tree matches exact ranking across all metrics and seed queries", () => {
  for (const metric of ["cosine", "euclidean", "manhattan"]) {
    const index = createIndexes(seed, metric);
    for (const item of seed) {
      const expected = search(seed, item.embedding, 5, metric).map((x) => x.id);
      assert.deepEqual(
        index.search(item.embedding, 5, "kdtree").map((x) => x.item.id),
        expected,
      );
      const approx = index.search(item.embedding, 5, "hnsw");
      assert.equal(approx[0].item.id, item.id);
      assert.ok(approx.filter((x) => expected.includes(x.item.id)).length >= 4);
    }
  }
});
test("HNSW exposes actual layers and valid edges, including empty indexes", () => {
  assert.deepEqual(
    createIndexes([], "cosine").search(embed("tree"), 5, "hnsw"),
    [],
  );
  const info = createIndexes(seed, "cosine").info();
  assert.equal(info.nodeCount, 20);
  assert.equal(info.nodesPerLayer[0], 20);
  const ids = new Set(info.nodes.map((x) => x.id));
  assert.ok(info.edges.length > 0);
  assert.ok(
    info.edges.every(
      (x) => ids.has(x.src) && ids.has(x.dst) && x.src !== x.dst,
    ),
  );
  for (let i = 1; i < info.nodesPerLayer.length; i++)
    assert.ok(info.nodesPerLayer[i] <= info.nodesPerLayer[i - 1]);
});
test("chunking overlaps and preserves the document ending", () => {
  const text = Array.from({ length: 400 }, (_, i) => "word" + i).join(" "),
    chunks = chunkText(text);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].split(" ").length, 180);
  assert.equal(chunks[1].split(" ")[0], "word150");
  assert.ok(chunks.at(-1).endsWith("word399"));
  assert.deepEqual(chunkText(""), []);
});
function fixture({ failSave = false, failEmbed = false } = {}) {
  let saved;
  const store = {
    load: async () => saved,
    save: async (value) => {
      if (failSave) throw new Error("Storage full");
      saved = structuredClone(value);
    },
  };
  const models = {
    embed: async (text) => {
      if (failEmbed) throw new Error("Download failed");
      return embed(text);
    },
    generate: async (q, ctx) => "Grounded answer: " + ctx[0].text,
  };
  return {
    engine: createLocalEngine({ store, models, seed }),
    reopen: () => createLocalEngine({ store, models, seed }),
  };
}
test("browser endpoint flow covers CRUD, all algorithms, benchmark, documents, RAG and persistence", async () => {
  const { engine, reopen } = fixture(),
    r = (...args) => engine.request(...args);
  assert.equal((await r("/status")).runtime, "browser");
  assert.equal((await r("/items")).length, 20);
  const added = await r(
    "/insert",
    {
      metadata: "New binary tree notes",
      category: "cs",
      embedding: embed("binary tree"),
    },
    "POST",
  );
  assert.equal(added.id, 21);
  const query = `?v=${embed("binary tree").join(",")}&k=3&metric=cosine`;
  for (const algo of ["hnsw", "kdtree", "bruteforce"]) {
    const result = await r("/search" + query + "&algo=" + algo);
    assert.equal(result.results.length, 3);
    assert.ok(result.latencyUs >= 0);
  }
  const benchmark = await r("/benchmark" + query);
  assert.equal(benchmark.itemCount, 21);
  for (const key of ["hnswUs", "kdtreeUs", "bruteforceUs"])
    assert.ok(Number.isFinite(benchmark[key]));
  await assert.rejects(
    () => r("/doc/ask", { question: "What is a tree?" }),
    /Add a document/,
  );
  const inserted = await r(
    "/doc/insert",
    {
      title: "Binary trees",
      text: "A binary tree has at most two children per node.",
    },
    "POST",
  );
  assert.equal(inserted.chunks, 1);
  assert.equal((await r("/doc/list")).length, 1);
  const answer = await r(
    "/doc/ask",
    { question: "How many children does a binary tree have?", k: 3 },
    "POST",
  );
  assert.equal(answer.contexts[0].title, "Binary trees");
  assert.match(answer.answer, /two children/);
  assert.equal((await reopen().request("/doc/list")).length, 1);
  assert.equal((await r("/delete/21", undefined, "DELETE")).ok, true);
  assert.equal(
    (await r("/doc/delete/" + inserted.ids[0], undefined, "DELETE")).ok,
    true,
  );
  assert.equal((await r("/items")).length, 20);
  assert.equal((await r("/doc/list")).length, 0);
});
test("failed model downloads and storage writes leave collections unchanged", async () => {
  const failedModel = fixture({ failEmbed: true }).engine;
  await assert.rejects(
    () =>
      failedModel.request(
        "/doc/insert",
        { title: "Test", text: "Example document." },
        "POST",
      ),
    /Download failed/,
  );
  assert.equal((await failedModel.request("/doc/list")).length, 0);
  const failedStore = fixture({ failSave: true }).engine;
  await assert.rejects(
    () =>
      failedStore.request(
        "/insert",
        { metadata: "Test", embedding: embed("tree") },
        "POST",
      ),
    /Storage full/,
  );
  assert.equal((await failedStore.request("/items")).length, 20);
});
