(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  saf.disposeContent?.();
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let active = null;
  let revision = 0;
  let pending = false;
  let pointerTarget = null;
  let keyboardUntil = 0;
  // Composed events expose the real input inside an open shadow root.
  const eventElement = event => event.composedPath?.()[0] || event.target;
  function focusedElement() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  }
  async function show(element) {
    active = element;
    const current = ++revision;
    pending = true;
    // Read on each user activation. A slow startup read must never overwrite a later import.
    let profile;
    let error = "";
    try { profile = await saf.readProfile(); }
    catch (failure) {
      profile = saf.emptyProfile();
      error = /context invalidated|extension.*invalid/i.test(failure?.message || "") ? "invalidated" : "storage";
    }
    if (current !== revision || active !== element) return;
    pending = false;
    if (!element.isConnected || !saf.isEditableElement(element)) { hide(); return; }
    saf.showMenu(element, saf.detectField(saf.collectFieldInfo(element), profile), profile, error);
  }
  function hide() {
    revision++;
    pending = false;
    active = null;
    saf.hideMenu();
  }
  document.addEventListener("pointerdown", event => {
    if (!event.isTrusted || saf.menuContains(event.target)) return;
    const element = eventElement(event);
    pointerTarget = saf.isEditableElement(element) ? element : null;
    keyboardUntil = 0;
    if (!pointerTarget) hide();
  }, { ...options, capture: true });
  document.addEventListener("focusin", event => {
    if (saf.menuContains(event.target)) return;
    const element = eventElement(event);
    if (!saf.isEditableElement(element)) { hide(); return; }
    const pointerFocus = pointerTarget === element;
    const userFocus = event.isTrusted && (pointerFocus || performance.now() <= keyboardUntil);
    pointerTarget = null;
    keyboardUntil = 0;
    if (userFocus && pointerFocus) active = element;
    else if (userFocus) show(element);
    else if (element !== active) hide();
  }, { ...options, capture: true });
  document.addEventListener("click", event => {
    if (!event.isTrusted || saf.menuContains(event.target)) return;
    pointerTarget = null;
    const element = eventElement(event);
    if (saf.isEditableElement(element) && focusedElement() === element) show(element);
    else hide();
  }, { ...options, capture: true });
  document.addEventListener("focusout", event => {
    if ((eventElement(event) === active || saf.menuContains(event.target)) && event.relatedTarget !== active && !saf.menuContains(event.relatedTarget)) hide();
  }, { ...options, capture: true });
  window.addEventListener("keydown", event => {
    if (!event.isTrusted) return;
    if (active && !saf.isEditableElement(active)) hide();
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing &&
        (event.code === "KeyZ" || event.key?.toLowerCase() === "z")) {
      const element = saf.menuContains(event.target) ? active : focusedElement();
      if (!saf.isEditableElement(element)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        pointerTarget = null;
        keyboardUntil = 0;
        show(element);
      }
      return;
    }
    if (event.key === "Tab") keyboardUntil = performance.now() + 500;
    if (event.key === "Escape") {
      const restore = saf.menuContains(document.activeElement) ? active : null;
      hide();
      restore?.focus({ preventScroll: true });
    }
    if (event.key === "ArrowDown" && eventElement(event) === active && saf.menuIsVisible()) {
      event.preventDefault();
      saf.focusMenu();
    }
  }, { ...options, capture: true });
  window.addEventListener("blur", hide, options);
  document.addEventListener("scroll", saf.positionMenu, { ...options, capture: true });
  window.addEventListener("resize", saf.positionMenu, options);
  const changed = (changes, area) => {
    if (area === "local" && changes.profile && active && (pending || saf.menuIsVisible())) show(active);
  };
  chrome.storage.onChanged.addListener(changed);
  saf.disposeContent = () => {
    controller.abort();
    try { chrome.storage.onChanged.removeListener(changed); } catch { /* Context may have been replaced. */ }
    hide();
  };
})();
