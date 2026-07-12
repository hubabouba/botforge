# Botforge Node bot runner image.
#
# Generic — one image runs ANY user's Node bot (Telegram via grammy, or Discord
# via discord.js). The bot's own source and dependencies are pulled/installed
# at runtime by supervisor.js; nothing about a specific project is baked in
# here. The user/AI never controls this image or its entrypoint — only the
# application source that supervisor.js fetches.
FROM node:20-slim

# Non-root user; /app is the only writable place the bot needs.
RUN useradd --create-home --uid 10001 botforge \
    && mkdir -p /app \
    && chown botforge:botforge /app

COPY supervisor.js /supervisor.js

USER botforge
WORKDIR /app

ENV NODE_ENV=production

# supervisor.js is PID 1: it fetches files, npm installs, runs the bot, and
# ships logs. It stays in the foreground for the life of the bot.
ENTRYPOINT ["node", "/supervisor.js"]
