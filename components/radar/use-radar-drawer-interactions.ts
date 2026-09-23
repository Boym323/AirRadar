"use client";

import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";

export type RadarDrawerState = "closed" | "traffic" | "aircraft" | "ogn";
export type RadarTrafficSource = "adsb" | "ogn";

interface UseRadarDrawerInteractionsOptions {
  drawerState: RadarDrawerState;
  trafficSource: RadarTrafficSource;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  closeRadarDrawer: () => void;
  openTrafficDrawer: (shortcut?: "search" | "filters") => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  focusSearchOnTrafficOpenRef: MutableRefObject<boolean>;
  trafficTriggerRef: RefObject<HTMLButtonElement | null>;
  previousDrawerStateRef: MutableRefObject<RadarDrawerState>;
}

export function useRadarDrawerInteractions({
  drawerState,
  trafficSource,
  filtersOpen,
  setFiltersOpen,
  closeRadarDrawer,
  openTrafficDrawer,
  searchInputRef,
  focusSearchOnTrafficOpenRef,
  trafficTriggerRef,
  previousDrawerStateRef,
}: UseRadarDrawerInteractionsOptions): void {
  useEffect(() => {
    if (drawerState === "closed" && previousDrawerStateRef.current !== "closed") {
      const trigger = trafficTriggerRef.current;
      if (trigger?.getClientRects().length && !trigger.disabled) trigger.focus();
    }
    previousDrawerStateRef.current = drawerState;
  }, [drawerState, previousDrawerStateRef, trafficTriggerRef]);

  useEffect(() => {
    if (drawerState !== "traffic" || !focusSearchOnTrafficOpenRef.current) return;
    const focusSearch = window.setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        focusSearchOnTrafficOpenRef.current = false;
      }
    }, 0);
    return () => window.clearTimeout(focusSearch);
  }, [drawerState, focusSearchOnTrafficOpenRef, searchInputRef]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const element = target instanceof HTMLElement ? target : null;
      if (!element) return false;
      return element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || element instanceof HTMLSelectElement
        || element.isContentEditable;
    }

    function handleKeyboardShortcut(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (filtersOpen) {
          setFiltersOpen(false);
          event.preventDefault();
        } else if (drawerState !== "closed") {
          closeRadarDrawer();
          event.preventDefault();
        }
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 821px)").matches && drawerState !== "traffic") {
          openTrafficDrawer("search");
        } else {
          searchInputRef.current?.focus();
        }
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 821px)").matches && drawerState !== "traffic") {
          openTrafficDrawer("filters");
        } else if (trafficSource === "adsb") {
          setFiltersOpen((current) => !current);
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut, true);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut, true);
  }, [closeRadarDrawer, drawerState, filtersOpen, openTrafficDrawer, searchInputRef, setFiltersOpen, trafficSource]);
}
