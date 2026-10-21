import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Layers,
  Search,
  Files,
  Sparkles,
  Network,
  Activity,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Trash2,
  Database,
  ChevronRight,
  Check,
  LoaderCircle,
  ExternalLink,
  Menu,
  Download,
  SlidersHorizontal,
  Zap,
  BookOpen,
} from "lucide-react";
import seed from "./seed.json";
import { categories, embed, search, project, request } from "./engine";
import "./style.css";
const nav = [
  ["Explore", Search],
  ["Vectors", Database],
  ["Documents", Files],
  ["Ask AI", Sparkles],
  ["Benchmark", Activity],
  ["Index graph", Network],
];
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function App() {
  const [modelProgress, setModelProgress] = useState(null);
  useEffect(() => {
    const handler = (e) => setModelProgress(e.detail.label ? e.detail : null);
    window.addEventListener("vdb-progress", handler);
    return () => window.removeEventListener("vdb-progress", handler);
  }, []);
  const [page, setPage] = useState("Explore"),
    [items, setItems] = useState(() => read("vdb-vectors", seed)),
    [base, setBase] = useState(() => read("vdb-server", "browser")),
    [connected, setConnected] = useState(false),
    [status, setStatus] = useState(null),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("binary search tree"),
    [algo, setAlgo] = useState("hnsw"),
    [metric, setMetric] = useState("cosine"),
    [k, setK] = useState(5),
    [results, setResults] = useState([]),
    [latency, setLatency] = useState(null),
    [selected, setSelected] = useState(null),
    [category, setCategory] = useState("all"),
    [docs, setDocs] = useState([]),
    [answer, setAnswer] = useState(null),
    [benchmark, setBenchmark] = useState(null),
    [graph, setGraph] = useState(null),
    [mobile, setMobile] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!base) {
      setConnected(false);
      setStatus(null);
      setDocs([]);
      return;
    }
    let cancelled = false;
    setConnected(false);
    (async () => {
      try {
        const [s, v, d] = await Promise.all([
          request(base, "/status"),
          request(base, "/items"),
          request(base, "/doc/list"),
        ]);
        if (!cancelled) {
          setStatus(s);
          setItems(v);
          setDocs(d);
          setConnected(true);
        }
      } catch (e) {
        if (!cancelled) setError("Cannot connect to the engine. " + e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);
  useEffect(() => {
    setError("");
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = () => [
      ...dialog.querySelectorAll(
        "button:not(:disabled),input,select,textarea,a[href]",
      ),
    ];
    focusable()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab") {
        const f = focusable(),
          first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal, busy]);
  useEffect(() => {
    if (!base) localStorage.setItem("vdb-vectors", JSON.stringify(items));
  }, [items, base]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const apiReady = () => {
    if (!connected)
      throw new Error(
        "The engine is starting. If it does not connect, select Free browser engine in Settings.",
      );
  };
  const doSearch = () =>
    run(async () => {
      if (!query.trim()) throw new Error("Enter a concept to search.");
      let data;
      const v = embed(query);
      if (base) {
        apiReady();
        data = await request(
          base,
          `/search?v=${v.join(",")}&k=${k}&metric=${metric}&algo=${algo}`,
        );
      } else {
        const t = performance.now();
        data = {
          results: search(items, v, k, metric),
          latencyUs: (performance.now() - t) * 1000,
        };
      }
      setResults(data.results);
      setLatency(data.latencyUs);
      setSelected(data.results[0]?.id);
    });
  const go = (p) => {
    setPage(p);
    setMobile(false);
    setError("");
    if (p === "Index graph" && connected)
      run(async () => setGraph(await request(base, "/hnsw-info")));
  };
  const reload = async () => {
    setItems(await request(base, "/items"));
    setDocs(await request(base, "/doc/list"));
  };
  const remove = (item, isDoc = false) =>
    run(async () => {
      if (base) {
        apiReady();
        const response = await request(
          base,
          `${isDoc ? "/doc/delete/" : "/delete/"}${item.id}`,
          undefined,
          "DELETE",
        );
        if (!response.ok) throw new Error("Item was not deleted.");
        await reload();
      } else setItems((v) => v.filter((x) => x.id !== item.id));
      setResults((v) => v.filter((x) => x.id !== item.id));
      setModal(null);
      setNotice("Item deleted");
    });
  const points = useMemo(() => project(items), [items]);
  const current = items.find((x) => x.id === selected);
  const exportVectors = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(items, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "vectordb-vectors.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("Explore");
          }}
        >
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          vector<span>db</span>
          <sup>STUDIO</sup>
        </a>
        <div className="workspace">
          <span className="avatar">S</span>
          <div>
            Personal workspace<small>Local-first intelligence</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([p, Icon]) => (
            <button
              key={p}
              className={page === p ? "nav-item active" : "nav-item"}
              onClick={() => go(p)}
            >
              <Icon size={18} />
              {p}
              {p === "Documents" && (
                <span className="count">{docs.length}</span>
              )}
              {page === p && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-card">
            <div>
              <span className="live-dot" />
              {base === "browser"
                ? "Free browser engine"
                : connected
                  ? "C++ engine connected"
                  : "Browser playground"}
              <ArrowUpRight size={14} />
            </div>
            <p>
              {connected
                ? "HNSW · KD-Tree · Brute force"
                : "20 seed vectors. Zero setup."}
            </p>
            <button onClick={() => setModal("settings")}>
              {connected ? "Manage connection" : "Connect your engine"}
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings size={18} />
            Settings
          </button>
          <a
            className="nav-item"
            href="https://github.com/Softeraman/Your-OWN-AI"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={18} />
            Project source
            <ExternalLink size={13} />
          </a>
          <div className="sidebar-footer">
            <span>VECTORDB ENGINE</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            Workspace
            <ChevronRight size={14} />
            <span>{page}</span>
          </div>
          <div className="header-right">
            <span className="mode">
              <span className="live-dot" />
              {connected
                ? base === "browser"
                  ? "Free · on-device"
                  : "Engine online"
                : base
                  ? "Engine offline"
                  : "Demo mode"}
            </span>
            <button
              className="icon-button"
              aria-label="Connection settings"
              onClick={() => setModal("settings")}
            >
              <SlidersHorizontal size={17} />
            </button>
            <span className="avatar small">S</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR KNOWLEDGE, CONNECTED</div>
              <h1>
                {page === "Explore"
                  ? "Explore your vector space"
                  : page === "Ask AI"
                    ? "A conversation with your knowledge"
                    : page === "Index graph"
                      ? "Inside the index"
                      : page}
              </h1>
              <p>
                {
                  {
                    Explore:
                      "Find meaning beyond keywords. Discover the connections in your data.",
                    Vectors: "The building blocks of your semantic universe.",
                    Documents: "Turn your documents into searchable knowledge.",
                    "Ask AI":
                      "Retrieve relevant context. Get grounded answers with source references.",
                    Benchmark:
                      "Three algorithms. One query. See how they compare.",
                    "Index graph":
                      "Explore the layers and connections of your HNSW graph.",
                  }[page]
                }
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setModal(page === "Documents" ? "document" : "vector")
              }
            >
              <Plus size={16} />
              {page === "Documents" ? "Add document" : "Add vector"}
            </button>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <section className="stats-grid">
            {[
              [
                Database,
                "Total vectors",
                items.length,
                "Across your collection",
              ],
              [Layers, "Dimensions", "16", "Demo embedding size"],
              [
                Network,
                "Search algorithms",
                "03",
                "HNSW, KD-Tree, Brute force",
              ],
              [
                Files,
                "Document chunks",
                docs.length,
                base === "browser"
                  ? "384D · on-device AI"
                  : status?.ollamaAvailable
                    ? "Ollama connected"
                    : "Connect Ollama to embed",
              ],
            ].map(([Icon, label, value, sub]) => (
              <div className="stat" key={label}>
                <div className="stat-label">
                  <Icon size={15} />
                  {label}
                </div>
                <strong>
                  {value}
                  <span>{label === "Dimensions" ? "D" : ""}</span>
                </strong>
                <small>{sub}</small>
              </div>
            ))}
          </section>
          {modelProgress && (
            <div className="model-progress" role="status">
              <LoaderCircle className="spin" size={16} />
              <span>{modelProgress.label}</span>
              {Number.isFinite(modelProgress.progress) && (
                <progress max="100" value={modelProgress.progress} />
              )}
            </div>
          )}
          {page === "Explore" && (
            <>
              <div className="explore-grid">
                <section className="panel map-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        <span className="tiny-square" />
                        Semantic map
                      </h2>
                      <p>2D principal component projection</p>
                    </div>
                    <span className="badge">{items.length} vectors</span>
                  </div>
                  <div className="plot">
                    <div className="plot-caption">
                      SEMANTIC SPACE <span>01 / 02</span>
                    </div>
                    <Map
                      points={points}
                      selected={selected}
                      results={results}
                      onSelect={setSelected}
                    />
                    <div className="plot-axis">
                      PRINCIPAL COMPONENT 1 <ArrowRight size={12} />
                    </div>
                  </div>
                  <div className="map-footer">
                    {Object.entries(categories).map(([c, v]) => (
                      <button
                        key={c}
                        onClick={() => {
                          setCategory(c);
                          go("Vectors");
                        }}
                      >
                        <i style={{ background: v.color }} />
                        {v.label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel query-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        <Search size={17} />
                        Semantic search
                      </h2>
                      <p>A little curiosity goes a long way.</p>
                    </div>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      doSearch();
                    }}
                  >
                    <label htmlFor="query">Search concept</label>
                    <textarea
                      id="query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What are you looking for?"
                      rows={3}
                    />
                    <div className="suggestions">
                      Try
                      {["binary tree", "sushi", "calculus"].map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => setQuery(x)}
                        >
                          {x}
                          <ArrowUpRight size={11} />
                        </button>
                      ))}
                    </div>
                    <label>
                      Algorithm
                      {!base && (
                        <span className="label-note">
                          C++ connection required
                        </span>
                      )}
                    </label>
                    <div className="segmented">
                      {[
                        ["hnsw", "HNSW"],
                        ["kdtree", "KD-Tree"],
                        ["bruteforce", "Brute force"],
                      ].map(([id, label]) => (
                        <button
                          title={
                            !base
                              ? "Browser mode uses exact brute force"
                              : label
                          }
                          type="button"
                          disabled={!base && id !== "bruteforce"}
                          className={
                            (base ? algo : "bruteforce") === id
                              ? "selected"
                              : ""
                          }
                          key={id}
                          onClick={() => setAlgo(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="two-fields">
                      <label>
                        Distance metric
                        <select
                          value={metric}
                          onChange={(e) => setMetric(e.target.value)}
                        >
                          <option value="cosine">Cosine</option>
                          <option value="euclidean">Euclidean</option>
                          <option value="manhattan">Manhattan</option>
                        </select>
                      </label>
                      <label>
                        Neighbors (k)
                        <select
                          value={k}
                          onChange={(e) => setK(Number(e.target.value))}
                        >
                          {[3, 5, 10, 20].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="primary full"
                      disabled={busy || !query.trim()}
                    >
                      <Search size={16} />
                      {busy ? "Searching…" : "Find nearest neighbors"}
                      <ArrowRight size={16} />
                    </button>
                    <p className="hint">
                      <span className="live-dot" />
                      {base === "browser"
                        ? "Browser algorithms · keyword-based 16D demo vectors"
                        : base
                          ? "Search runs on your C++ engine"
                          : "Demo: exact search with keyword-based 16D vectors"}
                    </p>
                  </form>
                </section>
              </div>
              <section className="panel results-panel">
                <div className="panel-head">
                  <div>
                    <h2>
                      Nearest neighbors{" "}
                      <span className="count">{results.length}</span>
                    </h2>
                    <p>
                      {results.length
                        ? `Results for “${query}”`
                        : "Run a search to discover related vectors"}
                    </p>
                  </div>
                  {latency !== null && (
                    <span className="badge green">
                      <Zap size={12} />
                      {latency.toFixed(1)} μs · {base ? algo : "browser exact"}
                    </span>
                  )}
                </div>
                {results.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>RANK</th>
                          <th>VECTOR</th>
                          <th>CATEGORY</th>
                          <th>DISTANCE</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr
                            key={r.id}
                            onClick={() => setSelected(r.id)}
                            className={selected === r.id ? "highlight" : ""}
                          >
                            <td>
                              <span className="rank">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setSelected(r.id)}
                              >
                                {r.metadata}
                              </button>
                              <small>vec_{String(r.id).padStart(4, "0")}</small>
                            </td>
                            <td>
                              <Category value={r.category} />
                            </td>
                            <td>
                              <span className="mono">
                                {r.distance.toFixed(4)}
                              </span>
                            </td>
                            <td>
                              <ArrowUpRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-inline">
                    <Search size={23} />
                    <span>Your next discovery starts with a search.</span>
                    <button className="text-button" onClick={doSearch}>
                      Try “binary search tree” <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </section>
              {current && (
                <div className="selection-detail">
                  <span className="live-dot" />
                  <strong>{current.metadata}</strong>
                  <span>16D embedding</span>
                  <div className="embedding-bars">
                    {current.embedding.map((v, i) => (
                      <i
                        key={i}
                        style={{
                          height: Math.max(3, v * 28),
                          background:
                            categories[current.category]?.color || "#b7e593",
                        }}
                        title={`Dimension ${i + 1}: ${v}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {page === "Vectors" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Vector collection</h2>
                  <p>
                    {base === "browser"
                      ? "Saved privately on this device"
                      : base
                        ? "Stored in the C++ engine"
                        : "Saved in this browser"}
                  </p>
                </div>
                <div className="actions">
                  <select
                    aria-label="Filter category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {Object.entries(categories).map(([c, v]) => (
                      <option key={c} value={c}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button className="secondary" onClick={exportVectors}>
                    <Download size={15} />
                    Export
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>VECTOR</th>
                      <th>CATEGORY</th>
                      <th>DIMENSIONS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .filter(
                        (i) => category === "all" || i.category === category,
                      )
                      .map((i) => (
                        <tr key={i.id}>
                          <td className="mono">
                            {String(i.id).padStart(4, "0")}
                          </td>
                          <td>{i.metadata}</td>
                          <td>
                            <Category value={i.category} />
                          </td>
                          <td className="mono">{i.embedding.length}</td>
                          <td>
                            <button
                              className="icon-button danger"
                              aria-label={`Delete ${i.metadata}`}
                              onClick={() => setModal({ delete: i })}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!items.length && (
                  <Empty
                    icon={Database}
                    title="Your collection is empty"
                    text="Add a vector to start exploring."
                  />
                )}
              </div>
            </section>
          )}
          {page === "Documents" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Knowledge library</h2>
                  <p>Text → overlapping chunks → embeddings → your index</p>
                </div>
                <span className="badge">{docs.length} chunks</span>
              </div>
              {!docs.length ? (
                <Empty
                  icon={Files}
                  title="Give your AI something to know"
                  text={
                    base === "browser"
                      ? "Add notes, articles, or research. Real 384D embeddings run privately on your device."
                      : "Your C++ server uses Ollama to embed every chunk."
                  }
                  action={() => setModal("document")}
                  actionLabel="Add your first document"
                />
              ) : (
                <div className="document-grid">
                  {docs.map((d) => (
                    <article className="document-card" key={d.id}>
                      <Files size={23} />
                      <h3>{d.title}</h3>
                      <p>{d.preview}</p>
                      <div>
                        <span>
                          {d.words} words · #{d.id}
                        </span>
                        <button
                          className="icon-button danger"
                          aria-label={`Delete ${d.title}`}
                          onClick={() => setModal({ delete: d, isDoc: true })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {page === "Ask AI" && (
            <section className="panel chat-panel">
              <div className="chat-intro">
                <span className="sparkle-icon">
                  <Sparkles size={30} />
                </span>
                <h2>From information to understanding.</h2>
                <p>Ask a question. Your documents provide the context.</p>
                <span className="badge">
                  {status?.genModel || "llama3.2"} · {docs.length} source chunks
                </span>
              </div>
              {answer && (
                <div className="answer">
                  <div className="eyebrow">ANSWER · {answer.model}</div>
                  <p>{answer.answer}</p>
                  <h3>Retrieved sources</h3>
                  {answer.contexts.map((c) => (
                    <details key={c.id}>
                      <summary>
                        {c.title} <span>distance {c.distance.toFixed(4)}</span>
                      </summary>
                      <p>{c.text}</p>
                    </details>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const question = new FormData(e.currentTarget).get(
                    "question",
                  );
                  run(async () => {
                    apiReady();
                    if (!docs.length)
                      throw new Error(
                        "Add a document before asking a question.",
                      );
                    setAnswer(await request(base, "/doc/ask", { question, k }));
                  });
                }}
              >
                <label htmlFor="question">Your question</label>
                <div className="chat-input">
                  <input
                    id="question"
                    name="question"
                    maxLength={1000}
                    required
                    placeholder="What would you like to understand?"
                  />
                  <button className="primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <ArrowRight size={17} />
                    )}
                    <span>{busy ? "Thinking…" : "Ask AI"}</span>
                  </button>
                </div>
                <p className="hint">
                  {base === "browser"
                    ? "Free on-device AI. Models download on first use and are cached. Small-model answers may be imperfect; check the source text."
                    : "Connect your engine and Ollama in Settings to generate answers."}
                </p>
              </form>
            </section>
          )}
          {page === "Benchmark" && (
            <section className="panel benchmark-panel">
              <div className="panel-head">
                <div>
                  <h2>Measure the difference</h2>
                  <p>
                    {base === "browser"
                      ? "Measured on this device. Average of 30 searches per algorithm, excluding index construction."
                      : "Real C++ timings for the same query."}
                  </p>
                </div>
                <Activity size={20} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    apiReady();
                    setBenchmark(
                      await request(
                        base,
                        `/benchmark?v=${embed(query).join(",")}&k=${k}&metric=${metric}`,
                      ),
                    );
                  });
                }}
              >
                <label htmlFor="benchmark-query">Search concept</label>
                <div className="chat-input">
                  <input
                    id="benchmark-query"
                    value={query}
                    required
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button className="primary" disabled={busy}>
                    Compare algorithms <ArrowRight size={16} />
                  </button>
                </div>
                <div className="two-fields">
                  <label>
                    Metric
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                    >
                      {["cosine", "euclidean", "manhattan"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Neighbors
                    <select value={k} onChange={(e) => setK(+e.target.value)}>
                      {[3, 5, 10, 20].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </form>
              {benchmark ? (
                <div className="benchmark-bars">
                  {[
                    ["HNSW", benchmark.hnswUs],
                    ["KD-Tree", benchmark.kdtreeUs],
                    ["Brute force", benchmark.bruteforceUs],
                  ].map(([name, n]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(1, (n / Math.max(benchmark.hnswUs, benchmark.kdtreeUs, benchmark.bruteforceUs, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <strong>{n} μs</strong>
                    </div>
                  ))}
                  <p className="hint">
                    Measured on {benchmark.itemCount} vectors. Timings vary with
                    {base === "browser" ? "device load" : "server load"}.
                  </p>
                </div>
              ) : (
                <Empty
                  icon={Activity}
                  title="Let the numbers speak"
                  text="Run a query to compare HNSW, KD-Tree, and brute force."
                />
              )}
            </section>
          )}
          {page === "Index graph" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Hierarchical navigable small world</h2>
                  <p>Real connections from the engine’s multilayer graph.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      apiReady();
                      setGraph(await request(base, "/hnsw-info"));
                    })
                  }
                >
                  Refresh index
                </button>
              </div>
              {graph ? (
                <>
                  <div className="graph-layers">
                    {graph.nodesPerLayer.map((n, i) => (
                      <div key={i}>
                        <span className="badge">LAYER {i}</span>
                        <strong>{n} nodes</strong>
                        <small>{graph.edgesPerLayer[i]} edges</small>
                      </div>
                    ))}
                  </div>
                  <Graph graph={graph} />
                </>
              ) : (
                <Empty
                  icon={Network}
                  title="A closer look at your index"
                  text="Refresh the index to inspect HNSW layers, nodes, and graph edges."
                />
              )}
            </section>
          )}
          <footer>
            <span>
              <span className="live-dot" />
              Built from scratch. Made to explore.
            </span>
            <a
              href="https://github.com/Softeraman/Your-OWN-AI"
              target="_blank"
              rel="noreferrer"
            >
              Open source on GitHub <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={typeof modal === "string" ? modal : "Confirm deletion"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "settings" ? (
              <>
                <span className="sparkle-icon">
                  <Settings size={24} />
                </span>
                <h2>Connect your engine</h2>
                <p>
                  Free browser mode runs search and AI on this device. Documents
                  stay in browser storage. You can also connect your original
                  C++/Ollama engine.
                </p>
                <button
                  className="primary full"
                  onClick={() => {
                    localStorage.setItem(
                      "vdb-server",
                      JSON.stringify("browser"),
                    );
                    setBase("browser");
                    setModal(null);
                    setResults([]);
                    setAnswer(null);
                    setGraph(null);
                    setBenchmark(null);
                    setNotice("Free browser engine selected");
                  }}
                >
                  Use free browser engine <Sparkles size={15} />
                </button>
                <p className="hint">
                  No API key or paid server. AI downloads model files from
                  Hugging Face on first use. AI runs on this device; speed
                  depends on its performance. Export data to keep a backup.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const url = new FormData(e.currentTarget)
                      .get("url")
                      .trim()
                      .replace(/\/$/, "");
                    run(async () => {
                      const parsed = new URL(url);
                      if (!["https:", "http:"].includes(parsed.protocol))
                        throw new Error("Use an HTTP or HTTPS address.");
                      const s = await request(url, "/status");
                      localStorage.setItem("vdb-server", JSON.stringify(url));
                      setBase(url);
                      setStatus(s);
                      setModal(null);
                      setNotice("Engine address saved");
                    });
                  }}
                >
                  <label htmlFor="server-url">Optional C++ server URL</label>
                  <input
                    id="server-url"
                    type="url"
                    name="url"
                    defaultValue={base === "browser" ? "" : base}
                    placeholder="https://your-engine.example.com"
                    required
                  />
                  <p className="hint">
                    Use HTTPS for a hosted server. For local development, use
                    http://localhost:8080. Your server must allow this UI’s
                    origin.
                  </p>
                  <button className="primary full" disabled={busy}>
                    {busy ? "Connecting…" : "Test & connect"}
                    <ArrowRight size={16} />
                  </button>
                </form>
                <button
                  className="secondary full"
                  onClick={() => {
                    localStorage.setItem("vdb-server", JSON.stringify(""));
                    setBase("");
                    setItems(read("vdb-vectors", seed));
                    setResults([]);
                    setGraph(null);
                    setAnswer(null);
                    setBenchmark(null);
                    setModal(null);
                  }}
                >
                  Use lightweight demo
                </button>
                <p className="hint">
                  Browser demo is the lightweight keyword playground. Choose the
                  free browser engine above for documents, local AI, all search
                  algorithms, and index inspection.
                </p>
              </>
            ) : modal.delete ? (
              <>
                <h2>Delete {modal.isDoc ? "document chunk" : "vector"}?</h2>
                <p>{modal.delete.metadata || modal.delete.title}</p>
                <p>
                  This removes the item from{" "}
                  {base ? "the engine" : "this browser"}.
                </p>
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={() => remove(modal.delete, modal.isDoc)}
                >
                  Delete item
                </button>
              </>
            ) : (
              <>
                <span className="sparkle-icon">
                  {modal === "document" ? (
                    <Files size={24} />
                  ) : (
                    <Database size={24} />
                  )}
                </span>
                <h2>
                  {modal === "document"
                    ? "Add to your knowledge"
                    : "Create a vector"}
                </h2>
                <p>
                  {modal === "document"
                    ? base === "browser"
                      ? "Text is split into overlapping 180-word chunks and embedded on this device. First use downloads the embedding model (about 23 MB)."
                      : "Your text is split into overlapping 250-word chunks and embedded with Ollama."
                    : "Add a concept using the project’s keyword embedding, or enter a custom 16D vector."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    run(async () => {
                      if (!values.title.trim())
                        throw new Error(
                          "Enter a title with at least one visible character.",
                        );
                      if (modal === "document") {
                        if (!values.text.trim())
                          throw new Error("Enter some document text.");
                        apiReady();
                        const data = await request(base, "/doc/insert", {
                          title: values.title.trim(),
                          text: values.text.trim(),
                        });
                        await reload();
                        setNotice(`Embedded ${data.chunks} document chunks`);
                      } else {
                        const embedding = values.embedding.trim()
                          ? values.embedding
                              .split(",")
                              .map((x) => Number(x.trim()))
                          : embed(values.title);
                        if (
                          (values.embedding.trim() &&
                            values.embedding
                              .split(",")
                              .some((x) => !x.trim())) ||
                          embedding.length !== 16 ||
                          embedding.some((x) => !Number.isFinite(x)) ||
                          Math.hypot(...embedding) === 0
                        )
                          throw new Error(
                            "Enter exactly 16 finite numbers, with at least one nonzero value.",
                          );
                        const vector = {
                          metadata: values.title.trim(),
                          category: values.category,
                          embedding,
                        };
                        if (base) {
                          apiReady();
                          await request(base, "/insert", vector);
                          await reload();
                        } else
                          setItems((v) => [
                            ...v,
                            {
                              ...vector,
                              id: Math.max(0, ...v.map((x) => x.id)) + 1,
                            },
                          ]);
                        setNotice("Vector added to collection");
                      }
                      setModal(null);
                    });
                  }}
                >
                  <label htmlFor="new-title">
                    {modal === "document"
                      ? "Document title"
                      : "Concept or label"}
                  </label>
                  <input
                    id="new-title"
                    name="title"
                    required
                    maxLength={200}
                    placeholder={
                      modal === "document"
                        ? "e.g. Operating systems notes"
                        : "e.g. Binary tree traversal"
                    }
                  />
                  {modal === "document" ? (
                    <>
                      <label htmlFor="document-text">Document text</label>
                      <textarea
                        id="document-text"
                        name="text"
                        required
                        rows={7}
                        placeholder="Paste your notes, article, or research…"
                      />
                    </>
                  ) : (
                    <>
                      <label htmlFor="new-category">Category</label>
                      <select id="new-category" name="category">
                        {Object.entries(categories).map(([c, v]) => (
                          <option value={c} key={c}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                      <label htmlFor="embedding">
                        Custom embedding{" "}
                        <span className="label-note">Optional</span>
                      </label>
                      <textarea
                        id="embedding"
                        name="embedding"
                        rows={3}
                        placeholder="16 comma-separated numbers, or leave empty"
                      />
                    </>
                  )}
                  <button className="primary full" disabled={busy}>
                    {busy
                      ? "Processing…"
                      : modal === "document"
                        ? "Embed & insert"
                        : "Add vector"}
                    <Plus size={16} />
                  </button>
                </form>
              </>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Category({ value }) {
  const c = categories[value] || { label: value, color: "#999" };
  return (
    <span className="category" style={{ color: c.color }}>
      <i style={{ background: c.color }} />
      {c.label}
    </span>
  );
}
function Empty({ icon: Icon, title, text, action, actionLabel }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          <Plus size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
function Map({ points, selected, results, onSelect }) {
  const extent =
    Math.max(0.1, ...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) *
    1.22;
  const xy = (p) => [300 + (p.x / extent) * 235, 160 - (p.y / extent) * 125];
  return (
    <svg
      className="scatter"
      viewBox="0 0 600 320"
      role="img"
      aria-label="PCA projection of vector embeddings. Select a point to inspect it."
    >
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".65" fill="#455149" />
        </pattern>
        <radialGradient id="glow">
          <stop stopColor="#b7e593" stopOpacity=".07" />
          <stop offset="1" stopColor="#b7e593" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="320" fill="url(#dots)" />
      <ellipse cx="300" cy="160" rx="280" ry="150" fill="url(#glow)" />
      <path d="M300 20V300M30 160H570" stroke="#28322d" strokeDasharray="4 6" />
      {points
        .filter((p) => results.some((r) => r.id === p.id))
        .map((p) => {
          const s = points.find((p) => p.id === selected);
          if (!s || s.id === p.id) return null;
          const [a, b] = xy(s),
            [c, d] = xy(p);
          return (
            <line
              key={p.id}
              x1={a}
              y1={b}
              x2={c}
              y2={d}
              stroke="#b7e593"
              opacity=".3"
              strokeDasharray="3 5"
            />
          );
        })}
      {points.map((p) => {
        const [x, y] = xy(p);
        const active = selected === p.id;
        return (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={p.metadata}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(p.id);
              }
            }}
            className="plot-point"
          >
            <title>{p.metadata}</title>
            <circle
              cx={x}
              cy={y}
              r={active ? 17 : 11}
              fill={categories[p.category]?.color || "#aaa"}
              opacity={active ? 0.18 : 0.07}
            />
            {active && (
              <circle
                cx={x}
                cy={y}
                r="12"
                stroke="#b7e593"
                strokeDasharray="2 3"
                fill="none"
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={active ? 5 : 3.8}
              fill={categories[p.category]?.color || "#aaa"}
            />
            {active && (
              <text
                x={Math.min(445, Math.max(25, x + 17))}
                y={y - 15}
                fill="#e0e8df"
                fontSize="10"
              >
                {p.metadata.split(":")[0].slice(0, 25)}
              </text>
            )}
          </g>
        );
      })}
      <text x="310" y="28" fill="#637268" fontSize="9">
        PC 2
      </text>
      <text x="555" y="152" fill="#637268" fontSize="9">
        PC 1
      </text>
      {!points.length && (
        <text x="300" y="160" fill="#89968c" textAnchor="middle">
          Add vectors to see their projection
        </text>
      )}
    </svg>
  );
}
function Graph({ graph }) {
  const coords = new Map(
    graph.nodes.map((n, i) => [
      n.id,
      [
        300 +
          Math.cos((i / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 230,
        180 +
          Math.sin((i / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 140,
      ],
    ]),
  );
  return (
    <svg
      viewBox="0 0 600 360"
      className="index-graph"
      aria-label="HNSW base layer graph"
    >
      {graph.edges
        .filter((e) => e.lyr === 0)
        .map((e, i) => {
          const a = coords.get(e.src),
            b = coords.get(e.dst);
          return a && b ? (
            <line
              key={i}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              stroke="#b7e593"
              opacity=".12"
            />
          ) : null;
        })}
      {graph.nodes.map((n) => {
        const [x, y] = coords.get(n.id);
        return (
          <g key={n.id}>
            <title>
              {n.metadata} · maximum layer {n.maxLyr}
            </title>
            <circle
              cx={x}
              cy={y}
              r="6"
              fill={categories[n.category]?.color || "#b7e593"}
            />
            <text x={x + 9} y={y + 3} fill="#9aab9d" fontSize="9">
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
createRoot(document.getElementById("root")).render(<App />);
