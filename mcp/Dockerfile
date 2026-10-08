FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.12-slim

RUN apt-get update && apt-get install -y libpq5 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

WORKDIR /app
COPY server.py state_patch.py ./

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:3100/health')" || exit 1
CMD uvicorn server:app --host 0.0.0.0 --port 3100
