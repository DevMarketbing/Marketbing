/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" for the in-browser demo build that needs no server. */
  readonly VITE_EMBEDDED?: string;
}
