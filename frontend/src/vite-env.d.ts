/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_APP_ID?: string
  readonly VITE_ALGORAND_NODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
