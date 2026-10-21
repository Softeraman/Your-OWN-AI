import { distance } from "../engine.js";

const compare = (a, b) => a.distance - b.distance || a.item.id - b.item.id;
export function bruteForce(items, q, k, metric) {
  return items
    .map((item) => ({ item, distance: distance(q, item.embedding, metric) }))
    .sort(compare)
    .slice(0, k);
}
export class KDTree {
  constructor(items, metric) {
    this.metric = metric;
    const build = (rows, depth) => {
      if (!rows.length) return null;
      const axis = depth % rows[0].embedding.length;
      rows = [...rows].sort((a, b) => a.embedding[axis] - b.embedding[axis]);
      const middle = Math.floor(rows.length / 2);
      return {
        item: rows[middle],
        axis,
        left: build(rows.slice(0, middle), depth + 1),
        right: build(rows.slice(middle + 1), depth + 1),
      };
    };
    this.root = build(items, 0);
  }
  search(q, k) {
    const found = [];
    const visit = (node) => {
      if (!node) return;
      const hit = {
        item: node.item,
        distance: distance(q, node.item.embedding, this.metric),
      };
      found.push(hit);
      found.sort(compare);
      if (found.length > k) found.pop();
      const delta = q[node.axis] - node.item.embedding[node.axis],
        near = delta < 0 ? node.left : node.right,
        far = delta < 0 ? node.right : node.left;
      visit(near);
      if (
        this.metric === "cosine" ||
        found.length < k ||
        Math.abs(delta) <= found.at(-1).distance
      )
        visit(far);
    };
    visit(this.root);
    return found;
  }
}
export class HNSW {
  constructor(items, metric = "cosine", m = 8) {
    this.metric = metric;
    this.m = m;
    this.nodes = new Map();
    this.top = -1;
    this.entry = null;
    for (const item of items) this.insert(item);
  }
  gap(q, id) {
    return distance(q, this.nodes.get(id).item.embedding, this.metric);
  }
  layerSearch(q, entries, ef, layer) {
    const visited = new Set(entries),
      queue = entries
        .map((id) => ({ id, distance: this.gap(q, id) }))
        .sort((a, b) => a.distance - b.distance),
      found = [...queue];
    while (queue.length) {
      const current = queue.shift();
      if (found.length >= ef && current.distance > found.at(-1).distance) break;
      for (const id of this.nodes.get(current.id).links[layer] || []) {
        if (visited.has(id)) continue;
        visited.add(id);
        const candidate = { id, distance: this.gap(q, id) };
        if (found.length < ef || candidate.distance <= found.at(-1).distance) {
          queue.push(candidate);
          queue.sort((a, b) => a.distance - b.distance);
          found.push(candidate);
          found.sort((a, b) => a.distance - b.distance);
          if (found.length > ef) found.pop();
        }
      }
    }
    return found;
  }
  insert(item) {
    let h = Math.imul(item.id + 1, 2654435761) >>> 0;
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const random = ((h >>> 0) + 1) / 4294967297,
      level = Math.min(8, Math.floor(-Math.log(random) / Math.log(this.m)));
    const node = {
      item,
      level,
      links: Array.from({ length: level + 1 }, () => new Set()),
    };
    if (this.entry === null) {
      this.nodes.set(item.id, node);
      this.entry = item.id;
      this.top = level;
      return;
    }
    let entry = this.entry;
    for (let layer = this.top; layer > level; layer--)
      entry = this.layerSearch(item.embedding, [entry], 1, layer)[0].id;
    this.nodes.set(item.id, node);
    for (let layer = Math.min(level, this.top); layer >= 0; layer--) {
      const hits = this.layerSearch(item.embedding, [entry], 100, layer).slice(
        0,
        this.m,
      );
      for (const hit of hits) {
        node.links[layer].add(hit.id);
        const other = this.nodes.get(hit.id);
        other.links[layer].add(item.id);
        if (other.links[layer].size > this.m * 2) {
          const retained = [...other.links[layer]]
            .sort(
              (a, b) =>
                this.gap(other.item.embedding, a) -
                this.gap(other.item.embedding, b),
            )
            .slice(0, this.m * 2);
          other.links[layer] = new Set(retained);
        }
      }
      entry = hits[0]?.id ?? entry;
    }
    if (level > this.top) {
      this.top = level;
      this.entry = item.id;
    }
  }
  search(q, k) {
    if (this.entry === null) return [];
    let entry = this.entry;
    for (let layer = this.top; layer > 0; layer--)
      entry = this.layerSearch(q, [entry], 1, layer)[0].id;
    return this.layerSearch(q, [entry], Math.max(64, k * 3), 0)
      .slice(0, k)
      .map((hit) => ({
        item: this.nodes.get(hit.id).item,
        distance: hit.distance,
      }))
      .sort(compare);
  }
  info() {
    const nodes = [...this.nodes.values()],
      nodesPerLayer = Array.from(
        { length: this.top + 1 },
        (_, layer) => nodes.filter((n) => n.level >= layer).length,
      ),
      edges = [];
    for (const n of nodes)
      n.links.forEach((links, lyr) => {
        for (const dst of links) edges.push({ src: n.item.id, dst, lyr });
      });
    return {
      topLayer: this.top,
      nodeCount: nodes.length,
      nodesPerLayer,
      edgesPerLayer: nodesPerLayer.map(
        (_, layer) => edges.filter((e) => e.lyr === layer).length,
      ),
      nodes: nodes.map((n) => ({
        id: n.item.id,
        metadata: n.item.metadata,
        category: n.item.category,
        maxLyr: n.level,
      })),
      edges,
    };
  }
}
export function createIndexes(items, metric) {
  const kd = new KDTree(items, metric),
    hnsw = new HNSW(items, metric);
  return {
    search(q, k, algo) {
      return algo === "kdtree"
        ? kd.search(q, k)
        : algo === "hnsw"
          ? hnsw.search(q, k)
          : bruteForce(items, q, k, metric);
    },
    info: () => hnsw.info(),
  };
}
export function chunkText(text, size = 180, overlap = 30) {
  const words = text.trim().split(/\s+/).filter(Boolean),
    chunks = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    chunks.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
  }
  return chunks;
}
