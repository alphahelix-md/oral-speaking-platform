type ViewportHost = Pick<Window, 'visualViewport' | 'document' | 'requestAnimationFrame' | 'cancelAnimationFrame'>;

export function observeVisualViewport(host: ViewportHost): () => void {
  const viewport = host.visualViewport;
  if (!viewport) return () => {};
  const style = host.document.documentElement.style;
  let frame: number | undefined;
  const clear = () => {
    style.removeProperty('--oral-viewport-height');
    style.removeProperty('--oral-viewport-top');
  };
  const update = () => {
    frame = undefined;
    // Preserve normal pinch zoom instead of resizing a dialog while zooming.
    if (Math.abs(viewport.scale - 1) > 0.05 || !Number.isFinite(viewport.height) || viewport.height <= 0) {
      clear();
      return;
    }
    style.setProperty('--oral-viewport-height', `${viewport.height}px`);
    style.setProperty('--oral-viewport-top', `${Math.max(0, viewport.offsetTop)}px`);
  };
  const schedule = () => { if (frame === undefined) frame = host.requestAnimationFrame(update); };
  update();
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  return () => {
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    if (frame !== undefined) host.cancelAnimationFrame(frame);
    clear();
  };
}
