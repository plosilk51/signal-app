# signal-app

A published copy of the Signal app: **https://plosilk51.github.io/signal-app/**

Signal itself (code and morning job) lives in a private repository and is hosted on
Cloudflare at signal.plosilk51.workers.dev. Some mobile carriers block workers.dev
addresses, so this public repository republishes the same public files (the app and
today's feed) on GitHub Pages every hour. See `.github/workflows/publish.yml`.
