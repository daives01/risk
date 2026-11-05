export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  if (target instanceof HTMLInputElement && target.type === 'range') return false

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export function hasModifierKey(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
}

export function hasCommandModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey
}

export function blurFocusedElement(element: unknown) {
  if (
    element &&
    typeof element === 'object' &&
    'blur' in element &&
    typeof element.blur === 'function'
  )
    element.blur()
}

export function browserPlatform(browser: { platform: string; userAgentData?: unknown }) {
  const data = browser.userAgentData

  return data !== null &&
    typeof data === 'object' &&
    'platform' in data &&
    typeof data.platform === 'string'
    ? data.platform
    : browser.platform
}
