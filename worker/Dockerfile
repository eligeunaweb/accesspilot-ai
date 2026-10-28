FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 HOME=/tmp XDG_CACHE_HOME=/tmp/cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY LICENSE ./LICENSE
COPY worker/LICENSE-APACHE-2.0 worker/THIRD-PARTY.md ./worker/
COPY src/ ./src/
COPY worker/entry.js worker/guard.js ./worker/
USER 65534:65534
ENTRYPOINT ["node", "/app/worker/entry.js"]
