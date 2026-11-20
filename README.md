# React + TypeScript + Vite

## Run KHETIGO locally

1. Copy `.env.example` to `.env.local`.
2. In your Supabase project, copy the Project URL and the publishable key (or legacy anon key) into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
3. Run the SQL in `src/lib/schema.sql` in the Supabase SQL Editor to create the required tables, policies, and role setup function.
4. For an existing linked project, apply later schema changes with `npx supabase db push --remote`. The equipment owner listing requires the migrations in `supabase/migrations`; running only the original schema setup will not apply future changes.
5. Restart the Vite server with `npm run dev`.

The login and account creation buttons stay disabled until both Supabase values are present. If email confirmation is enabled in Supabase Auth, new users must confirm the message sent to their email before signing in. Never put a Supabase service-role key in this frontend app.

## Farmer Doctor Assistant integration

The Farmer Profile includes separate Camera Chat, Voice Chat, Video Chat, and Normal Chat pages. Camera access and capture, local video playback, browser speech recognition, spoken answer playback, and per-user/per-mode browser conversation history are handled by the client. AI replies and media analysis require a server endpoint; this project does not include an AI provider or assistant backend.

Set `VITE_FARMER_ASSISTANT_API_URL` in `.env.local` to the base URL of the assistant server, then restart Vite. The client calls:

- `POST /chat` with a JSON body containing `mode`, `message`, recent `history`, `audience: "farmer"`, and the farming scope instructions.
- `POST /analyze` with multipart fields `mode`, `question`, `audience`, `instructions`, and `media` (image or video).

Both endpoints must return JSON in the form `{ "answer": "..." }`. They must verify the Supabase access token in the `Authorization: Bearer ...` header, load the caller's profile, reject callers whose role is not `Farmer`, enforce farming and KHETIGO order topics on the server, validate and limit uploaded media, and keep AI provider secrets on the server. The client-supplied audience and instructions are context only and must not be trusted as authorization. Video understanding requires a model/provider that supports video or a server-side video-frame extraction pipeline; without that, the server should return a clear unsupported-analysis response. The browser uses Web Speech API when available and falls back to typed questions when unavailable.

## Available scripts

- `npm run dev` starts the local development server.
- `npm run build` checks TypeScript and creates a production build.
- `npm run lint` runs ESLint.

The remaining sections describe the original Vite template.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
