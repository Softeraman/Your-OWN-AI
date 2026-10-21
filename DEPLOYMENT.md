# VectorDB Studio — free Vercel deployment

The live app runs on **https://vectordb-studio.vercel.app**. It defaults to a browser engine, so documents, AI, algorithms, benchmarks, and HNSW graph inspection do not require a paid backend, an API key, or Ollama.

## Run or deploy

```sh
npm ci
npm run dev
npm test
npm run build
```

Use Node.js 22.12+ (or Node.js 20.19+). Vercel uses the Vite settings in `vercel.json` and serves `dist`. Keep the repository root as Root Directory. No server environment variables or secrets are needed. Model files download directly from Hugging Face to each visitor’s device; they are not bundled into the deployment. Vercel's normal Hobby limits still apply.

## How the free browser engine works

- Vector CRUD, cosine/Euclidean/Manhattan distance, a balanced KD-Tree, a multilayer HNSW index, exact brute-force search, PCA, measured algorithm timings, and graph inspection run locally. Timings average 30 searches after index construction.
- Demo vectors keep the project's 16D keyword embeddings and 20 original seed records. They are educational categorical vectors, not language-model embeddings.
- Documents are split into 180-word chunks with a 30-word overlap. Transformers.js runs `Xenova/all-MiniLM-L6-v2` with quantized weights to produce real 384D semantic embeddings.
- Questions use those embeddings to retrieve document chunks. `onnx-community/SmolLM2-135M-Instruct-ONNX` generates an answer on the device. Expand the source references to inspect the retrieved text. This small model can make mistakes; use the sources to verify its answers.
- A worker keeps inference away from the interface. The first document downloads the embedding model (approximately 23 MB); the first answer downloads a larger language model. Download progress is shown and model files are cached when browser storage permits. An internet connection is needed for those first downloads. Speed and memory requirements depend on the device.
- Vectors, documents, and embeddings persist in IndexedDB for this site and browser profile. They are not uploaded to Vercel or an inference service. Hugging Face receives model-file requests, not document text. There is no cloud sync or cross-device sharing, and clearing site data removes saved documents.

Settings also offers the original lightweight demo and an optional C++/Ollama server connection. The original C++ source is retained; the hosted browser implementation is JavaScript/WebAssembly and uses different models and embedding dimensions.

## Optional original C++ engine

```sh
docker compose up --build -d
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3.2
```

Open http://localhost:8080 and enter http://localhost:8080 in Settings. The C++ server serves compiled React assets, falling back to `legacy.html` if no React build exists. The original engine stores data in memory and has no authentication: restarting it clears documents. Compose persists model downloads only. It is optional and is not deployed by the free browser configuration.

## Verification

`npm test` covers metrics, PCA, KD-Tree exact ranking, HNSW recall/graph validity, chunk overlap, the local API CRUD/RAG flow, persistence, and atomic handling of failed downloads/storage writes. Model contract tests use deterministic fixtures. An actual 384D embedding and a generated answer were also tested with the selected model files separately. Browser inference and storage are verified against the deployed site when browser automation is available. The original C++ compilation remains in GitHub CI.
