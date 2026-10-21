FROM node:22-bookworm-slim AS ui
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html ./
COPY src ./src
RUN npm run build

FROM gcc:14-bookworm AS engine
WORKDIR /app
COPY main.cpp httplib.h ./
RUN g++ -std=c++17 -O2 -pthread main.cpp -o db

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=engine /app/db ./db
COPY --from=ui /app/dist ./dist
COPY legacy.html ./legacy.html
RUN useradd --system app && chown -R app /app
USER app
EXPOSE 8080
CMD ["./db"]
