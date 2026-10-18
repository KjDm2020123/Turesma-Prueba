"use client";

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

export function useMobileMenuAccessibility(
  isOpen: boolean,
  setIsOpen: Dispatch<SetStateAction<boolean>>,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
) {
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }

    wasOpen.current = true;
    const panel = panelRef.current;
    const focusableElements = () => Array.from(
      panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || [],
    ).filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));

    panel?.querySelector<HTMLElement>("nav a[href], nav button:not([disabled])")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, panelRef, setIsOpen, triggerRef]);
}
