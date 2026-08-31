# FullQA Bot

Standalone QA service for testing one or many web applications from a single dashboard.

## Features

- multi-URL dashboard
- comprehensive QA prompt generator
- generic Playwright discovery and compatibility checks
- Chromium, Firefox, WebKit, iPhone and Android coverage
- health probing and same-origin route discovery
- job logs and summary verdicts
- Docker/Railway ready
- no dependency on Tijra or any other application code

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Railway

Create a new Railway service from this repository. No Root Directory is needed because FullQA is now the repository root. Railway can build directly from the included `Dockerfile`.

Generate a public domain, open it, paste one or more target application URLs, then either generate a comprehensive QA prompt or run the generic automated QA.

## Important

FullQA treats every target as an external application. App-specific deep workflows can be added later as optional profiles without coupling the bot repository to the target application's source code.
