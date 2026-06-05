/**
 * Auto-resize a textarea as its content grows.
 * Removes scrollbar and makes it expand downward.
 */
export function autoResize(node: HTMLTextAreaElement) {
  function resize() {
    node.style.height = 'auto';
    node.style.height = node.scrollHeight + 'px';
  }
  node.addEventListener('input', resize);
  resize();
  return {
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}
