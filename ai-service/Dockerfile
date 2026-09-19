FROM python:3.11-slim
WORKDIR /srv/ai-service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY main.py ./
ENV AI_SERVICE_PORT=8000
EXPOSE 8000
# Render injects PORT; default 8000 keeps local/Compose behavior unchanged.
# Binds 0.0.0.0 (loopback-only is unreachable on Render).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
