# Botforge Python bot runner image.
#
# Generic — one image runs ANY user's Python bot. The bot's own source and
# dependencies are pulled/installed at runtime by supervisor.py; nothing about a
# specific project is baked in here. The user/AI never controls this image or its
# entrypoint — only the application source that supervisor.py fetches.
FROM python:3.12-slim

# Non-root user; /app is the only writable place the bot needs.
RUN useradd --create-home --uid 10001 botforge \
    && mkdir -p /app \
    && chown botforge:botforge /app

COPY supervisor.py /supervisor.py

USER botforge
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# supervisor.py is PID 1: it fetches files, installs deps, runs the bot, and
# ships logs. It stays in the foreground for the life of the bot.
ENTRYPOINT ["python", "-u", "/supervisor.py"]
