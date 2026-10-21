# VectorDB Studio deployment

## React UI

Node.js 20.19+ or 22.12+ is required.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the printed Vite URL. The UI starts in browser demo mode with the exact 20 vectors from `main.cpp`. Demo changes persist in localStorage on that device. Demo search uses a deterministic keyword-based 16D embedding and exact distance ranking; algorithm buttons select the C++ algorithm only when a server is connected. Timings are actual measured browser timings, not C++ benchmarks. The map uses PCA computed from the stored embeddings.

All original endpoints are wired into the React app: vector insert/delete/list/search, benchmark, HNSW graph inspection, document insert/list/delete, and RAG Q&A with expandable source text. `/doc/search` is an intermediate retrieval API; Q&A uses `/doc/ask`, which returns retrieved contexts with the generated answer.

## Vercel

Import `Softeraman/Your-OWN-AI` into Vercel. Keep the repository root as Root Directory, select Vite, and use `npm run build` with output `dist`. `vercel.json` supplies these settings. No secrets are required for the browser playground. Or run `npx vercel --prod` in an authenticated CLI session.

Vercel serves the React UI. The original C++ process and Ollama models need a separate long-running server; they cannot run inside this static Vite deployment. In Settings → Connect your engine, enter the server’s HTTPS origin. The browser talks directly to it. An HTTP engine may be blocked by mixed-content or local-network browser policies when the UI uses HTTPS.

## Run the complete stack with Docker

```sh
docker compose up --build -d
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.2
```

Open http://localhost:8080 and connect to http://localhost:8080 in Settings. The C++ server serves the compiled React assets. The original single-file UI is preserved as `legacy.html` and is served if a React build is absent.

For a hosted backend use a VM or container host with sufficient RAM for Ollama, place an HTTPS reverse proxy in front of the engine, and configure access control before allowing private documents. `OLLAMA_HOSTNAME` changes the Ollama service hostname (default `127.0.0.1`, port 11434). `PORT` changes the engine listening port (default 8080).

The original engine stores vectors/documents in memory and has no authentication. Its data resets on restart. Compose persists downloaded models, not documents. Browser demo data is separate from server data. Do not treat the existing backend as durable multi-user storage or expose private documents through an unauthenticated public endpoint.

## Verification

`npm test` checks seed validity, semantic category retrieval across all three metrics, metric values, rank ordering, PCA edge cases, and REST error handling. `npm run build` checks the production bundle. Test the connected engine endpoints and actual Ollama embeddings/generation on the deployment host; those require C++17 and installed Ollama models.
