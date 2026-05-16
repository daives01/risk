export function serializeComposerNode(root: HTMLElement) {
  let text = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      text += token;
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return text.replace(/\u00a0/g, " ");
}

export function getComposerCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return serializeComposerNode(root).length;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return serializeComposerNode(root).length;

  let cursor = 0;
  let found = false;
  const walk = (node: Node) => {
    if (found) return;
    if (node === range.startContainer) {
      cursor += range.startOffset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      cursor += (node.textContent ?? "").length;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      cursor += token.length;
      return;
    }
    const children = Array.from(node.childNodes);
    if (node === range.startContainer) {
      for (let index = 0; index < range.startOffset; index += 1) walk(children[index]!);
      found = true;
      return;
    }
    for (const child of children) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  return cursor;
}

export function setComposerCursor(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let cursor = 0;
  let placed = false;
  const placeIn = (node: Node) => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = (node.textContent ?? "").length;
      if (cursor + textLength >= offset) {
        range.setStart(node, Math.max(0, offset - cursor));
        range.collapse(true);
        placed = true;
      }
      cursor += textLength;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    if (token) {
      if (cursor + token.length >= offset) {
        range.setStartAfter(node);
        range.collapse(true);
        placed = true;
      }
      cursor += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) placeIn(child);
  };

  for (const child of Array.from(root.childNodes)) placeIn(child);
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
