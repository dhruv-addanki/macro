# Macro Evals

This folder contains the initial internal eval set described in the PRD and build plan.

Each case includes input, expected macro range or unit output, expected confidence or correction type, expected assumptions, and unacceptable errors.

Run:

```bash
npm run eval:api
```

The runner uses the same API service modules as the app. In local development without `OPENAI_API_KEY`, it evaluates deterministic fallback behavior and correction memory.
