/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" for the in-browser demo build that needs no server. */
  readonly VITE_EMBEDDED?: string;
  /** API server address for builds not served by it (the Android app). */
  readonly VITE_API_URL?: string;
}
