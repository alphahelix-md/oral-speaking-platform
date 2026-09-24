"use client";

import { useEffect } from 'react';
import { observeVisualViewport } from '@/lib/visual-viewport';

// Keep dialogs inside the visible area when a mobile keyboard opens.
export function ViewportAdapter() {
  useEffect(() => observeVisualViewport(window), []);
  return null;
}
