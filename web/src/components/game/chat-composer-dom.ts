const CARET_SPACER = "\u200b";

function getTextNodeSerializedLength(node: Node, endOffset?: number): number {
  const text = (node.textContent ?? "").slice(0, endOffset);
  return text.replaceAll(CARET_SPACER, "").length;
}

export function serializeComposerNode(root: HTMLElement) {
  let text = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? "").replaceAll(CARET_SPACER, "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    const display = node.dataset.mentionDisplay;
    if (token && display && node.textContent === display) {
      text += token;
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return text.replace(/\u00a0/g, " ");
}

function getSerializedNodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return getTextNodeSerializedLength(node);
  if (!(node instanceof HTMLElement)) return 0;
  const token = node.dataset.mentionToken;
  const display = node.dataset.mentionDisplay;
  if (token && display && node.textContent === display) return token.length;
  return Array.from(node.childNodes).reduce((length, child) => length + getSerializedNodeLength(child), 0);
}

function getIntactMentionElement(root: HTMLElement, node: Node) {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const mention = element?.closest<HTMLElement>("[data-mention-token]");
  if (!mention || !root.contains(mention)) return null;
  const token = mention.dataset.mentionToken;
  const display = mention.dataset.mentionDisplay;
  return token && display && mention.textContent === display ? mention : null;
}

export function getComposerCursor(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return serializeComposerNode(root).length;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return serializeComposerNode(root).length;
  const activeMention = getIntactMentionElement(root, range.startContainer);

  let cursor = 0;
  let found = false;
  const walk = (node: Node) => {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node === range.startContainer) {
        cursor += getTextNodeSerializedLength(node, range.startOffset);
        found = true;
        return;
      }
      cursor += getTextNodeSerializedLength(node);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    const display = node.dataset.mentionDisplay;
    if (token && display && node.textContent === display) {
      if (node === activeMention) {
        cursor += range.startOffset === 0 ? 0 : token.length;
        found = true;
        return;
      }
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

  if (range.startContainer === root) {
    const children = Array.from(root.childNodes);
    for (let index = 0; index < range.startOffset; index += 1) {
      cursor += getSerializedNodeLength(children[index]!);
    }
    return cursor;
  }

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
      const text = node.textContent ?? "";
      const textLength = getTextNodeSerializedLength(node);
      if (cursor + textLength >= offset) {
        let serializedOffset = 0;
        let domOffset = 0;
        while (domOffset < text.length && serializedOffset < offset - cursor) {
          if (text[domOffset] !== CARET_SPACER) serializedOffset += 1;
          domOffset += 1;
        }
        range.setStart(node, domOffset);
        range.collapse(true);
        placed = true;
      }
      cursor += textLength;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mentionToken;
    const display = node.dataset.mentionDisplay;
    if (token && display && node.textContent === display) {
      if (offset === cursor) {
        range.setStartBefore(node);
        range.collapse(true);
        placed = true;
      } else if (cursor + token.length >= offset) {
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

export function createComposerMentionNode(token: string, display: string) {
  const tag = document.createElement("span");
  tag.contentEditable = "false";
  tag.dataset.chatTag = "true";
  tag.dataset.mentionToken = token;
  tag.dataset.mentionDisplay = display;
  tag.className = "inline-flex align-baseline rounded border border-primary/35 bg-primary/10 px-1 font-semibold not-italic text-primary";
  tag.textContent = display;
  return tag;
}

export function createComposerCaretSpacer() {
  return document.createTextNode(CARET_SPACER);
}
