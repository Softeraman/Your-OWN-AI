export const categories = {
  cs: { label: "Computer science", color: "#91b9ff" },
  math: { label: "Mathematics", color: "#bb9afa" },
  food: { label: "Food & cooking", color: "#ebbc79" },
  sports: { label: "Sports", color: "#89cbb2" },
};
const keywords = {
  cs: "algorithm data tree graph array linked hash stack queue sort binary dynamic programming recursion complexity pointer node search insert bfs dfs heap trie computer",
  math: "calculus matrix probability theorem integral derivative linear algebra equation function prime modular combinatorics permutation eigenvalue statistics proof mathematics",
  food: "food pizza sushi ramen pasta recipe cook eat restaurant dish ingredient flavor spice noodle bread croissant taco fish rice soup",
  sports:
    "sport basketball football tennis chess swim game play score team athlete competition match tournament olympic dribble tackle serve",
};
export function embed(text) {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const scores = Object.values(keywords).map((list) =>
    words.reduce(
      (n, w) =>
        n +
        (list.split(" ").some((k) => w.includes(k) || k.startsWith(w)) ? 1 : 0),
      0,
    ),
  );
  const max = Math.max(...scores, 1);
  return scores.flatMap((s) =>
    s
      ? [0.88, 0.88, 0.81, 0.77].map((x) => (x * s) / max)
      : [0.08, 0.08, 0.08, 0.08],
  );
}
export function distance(a, b, metric = "cosine") {
  if (metric === "euclidean")
    return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  if (metric === "manhattan")
    return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? 1 - a.reduce((s, x, i) => s + x * b[i], 0) / norm : 1;
}
export function search(items, vector, k, metric) {
  return items
    .map((x) => ({ ...x, distance: distance(vector, x.embedding, metric) }))
    .sort((a, b) => a.distance - b.distance || a.id - b.id)
    .slice(0, k);
}
export function project(items) {
  if (!items.length) return [];
  const d = items[0].embedding.length,
    mean = Array.from(
      { length: d },
      (_, j) => items.reduce((s, x) => s + x.embedding[j], 0) / items.length,
    );
  const x = items.map((p) => p.embedding.map((v, j) => v - mean[j]));
  const dot = (a, b) => a.reduce((s, v, j) => s + v * b[j], 0);
  const axis = (previous) => {
    let v = Array.from({ length: d }, (_, j) => Math.sin(j + 1));
    for (let n = 0; n < 60; n++) {
      let next = Array(d).fill(0);
      for (const row of x) {
        const score = dot(row, v);
        row.forEach((z, j) => (next[j] += z * score));
      }
      if (previous) {
        const p = dot(next, previous);
        next = next.map((z, j) => z - p * previous[j]);
      }
      const norm = Math.hypot(...next) || 1;
      v = next.map((z) => z / norm);
    }
    return v;
  };
  const a = axis(),
    b = axis(a);
  return items.map((p, i) => ({ ...p, x: dot(x[i], a), y: dot(x[i], b) }));
}
export async function request(base, path, body, method) {
  const response = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path.includes("/doc/") ? 180000 : 15000),
  });
  if (!response.ok)
    throw new Error(
      `Server returned ${response.status}. Check your connection settings.`,
    );
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}
