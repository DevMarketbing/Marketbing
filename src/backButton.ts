import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * Android back button inside the app. Screens that can be backed out of
 * (a sub-page, a dialog, the menu) register a "layer" while they are
 * showing; the back button closes the most recently opened one, and only
 * leaves the app when none is open. On the website this does nothing, so
 * browser behaviour is unchanged.
 */

/** Back closes the highest level first, then the most recently opened. */
export const BackLevel = {
  /** A section other than the start page: back returns to the start page. */
  section: 0,
  /** A sub-page inside a section (influencer details, plan steps). */
  page: 1,
  /** A dialog over a page. */
  dialog: 2,
  /** The navigation drawer. */
  menu: 3,
} as const;

interface Layer {
  level: number;
  close: () => void;
}

const layers: Layer[] = [];

function topLayer(): Layer | undefined {
  let top: Layer | undefined;
  for (const layer of layers) if (!top || layer.level >= top.level) top = layer;
  return top;
}

/** Closes the top layer. Returns false when none is open (time to leave the app). */
export function goBack(): boolean {
  const top = topLayer();
  top?.close();
  return top !== undefined;
}

/** Registers a layer; returns the function that removes it again. */
export function addLayer(level: number, close: () => void): () => void {
  const layer: Layer = { level, close };
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i !== -1) layers.splice(i, 1);
  };
}

if (Capacitor.isNativePlatform()) {
  void App.addListener("backButton", () => {
    if (!goBack()) void App.exitApp();
  });
}

/**
 * While `active`, the back button calls `close` (unless a layer opened
 * later is still showing). `close` may step back one level and leave the
 * layer active, e.g. moving from plan details back to the plan list.
 */
export function useBackLayer(active: boolean, level: number, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active) return;
    return addLayer(level, () => closeRef.current());
  }, [active, level]);
}
