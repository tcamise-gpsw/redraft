export function extractTextContent(renderedHtml: string): string {
  const container = document.createElement('div');
  container.innerHTML = renderedHtml;
  return container.textContent ?? '';
}

export function findTextRange(containerEl: HTMLElement, text: string): Range | null {
  if (!text) {
    return null;
  }

  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const value = currentNode.textContent ?? '';
    const start = value.indexOf(text);

    if (start >= 0) {
      const range = document.createRange();
      range.setStart(currentNode, start);
      range.setEnd(currentNode, start + text.length);
      return range;
    }

    currentNode = walker.nextNode();
  }

  return null;
}
