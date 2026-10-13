(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  saf.isDropdownElement = element => {
    if (element?.nodeType !== 1) return false;
    if (element.tagName === "SELECT" || element.hasAttribute("list")) return true;
    const popupRoles = ["combobox", "listbox", "menu", "tree", "grid"];
    // Check only the current control and up to three wrappers, never scan the page.
    let node = element;
    for (let depth = 0; node && depth <= 3 && !["BODY", "HTML"].includes(node.tagName); depth++, node = node.parentElement || node.getRootNode?.().host) {
      const roles = (node.getAttribute("role") || "").toLowerCase().split(/\s+/);
      const popup = (node.getAttribute("aria-haspopup") || "").toLowerCase();
      if (roles.some(role => popupRoles.includes(role)) || ["true", "listbox", "menu", "tree", "grid", "dialog"].includes(popup)) return true;
      if (node === element && (node.hasAttribute("aria-expanded") || ["list", "both"].includes(node.getAttribute("aria-autocomplete")))) return true;
      const references = `${node.getAttribute("aria-controls") || ""} ${node.getAttribute("aria-owns") || ""}`.trim().split(/\s+/).filter(Boolean);
      for (const id of references.slice(0, 8)) {
        const linked = node.getRootNode?.().getElementById?.(id) || element.ownerDocument.getElementById(id);
        if (linked && (linked.tagName === "DATALIST" || (linked.getAttribute("role") || "").toLowerCase().split(/\s+/).some(role => popupRoles.includes(role)))) return true;
      }
    }
    // Some custom dropdowns omit accessibility semantics but explicitly say "select".
    const placeholder = (element.getAttribute("placeholder") || "").trim();
    return /^(?:请(?:先)?选择|选择|please\s+(?:select|choose)\b|select\b|choose\b)/i.test(placeholder);
  };
  saf.isEditableElement = element => Boolean(element?.nodeType === 1 && !element.disabled && !element.readOnly && (
    element.tagName === "TEXTAREA" || (element.tagName === "INPUT" && ["text", "tel", "email", "number"].includes(element.type))
  ) && !saf.isDropdownElement(element));
  // Read text nodes only, with a strict budget. Never read input values or walk the entire document.
  function nearbyText(root, limit = 200) {
    if (!root || ["BODY", "HTML"].includes(root.tagName)) return "";
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let result = "";
    let visited = 0;
    let node = walker.nextNode();
    while (node && visited++ < 80 && result.length < limit) {
      if (node.nodeType === 1 && (node.matches("input, textarea, select, script, style, [contenteditable], .saf-menu") || node.hidden)) {
        // Skip the entire subtree, including textarea values and scripts.
        const skipped = node;
        while (node && node !== root && !node.nextSibling) node = node.parentNode;
        if (!node || node === root) break;
        walker.currentNode = node.nextSibling;
        node = walker.currentNode;
        if (node === skipped) break;
        continue;
      }
      if (node.nodeType === 3) result += ` ${node.textContent.slice(0, limit - result.length).trim()}`;
      node = walker.nextNode();
    }
    return result.trim().slice(0, limit);
  }
  saf.collectFieldInfo = element => {
    const labels = Array.from(element.labels || []).map(label => nearbyText(label)).join(" ").slice(0, 200);
    const parent = element.parentElement;
    const previous = nearbyText(element.previousElementSibling);
    const nearby = [previous, nearbyText(parent), nearbyText(parent?.parentElement)].join(" ").slice(0, 200);
    return {
      type: element.type || "", name: element.getAttribute("name") || "", id: element.id || "",
      placeholder: element.getAttribute("placeholder") || "", autocomplete: element.getAttribute("autocomplete") || "",
      ariaLabel: element.getAttribute("aria-label") || "", title: element.title || "", label: labels, nearbyText: nearby
    };
  };
  const normalize = value => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  function matches(value, keywords) {
    const text = normalize(value);
    const compact = text.replace(/[\s_-]/g, "");
    return keywords.reduce((longest, keyword) => {
      const normalized = normalize(keyword);
      if (/[^\x00-\x7f]/.test(normalized)) return text.includes(normalized) ? Math.max(longest, normalized.length) : longest;
      const token = normalized.replace(/[\s_-]/g, "");
      // Short English words (name, mail, tel, sex, zip, city...) need token boundaries.
      const matched = token.length <= 4 ? text.split(/[^a-z0-9]+/).includes(token) : compact.includes(token);
      return matched ? Math.max(longest, token.length) : longest;
    }, 0);
  }
  saf.detectField = (info, profile) => (profile ? saf.getProfileFields(profile) : saf.FIELD_RULES).map(rule => {
    let score = 0;
    let specificity = 0;
    const autocomplete = normalize(info.autocomplete).split(/\s+/).at(-1);
    if (rule.autocomplete?.includes(autocomplete)) score += 100;
    for (const [source, weight] of [["label", 80], ["placeholder", 70], ["ariaLabel", 70], ["name", 60], ["id", 50], ["title", 40], ["nearbyText", 30]]) {
      const matchLength = matches(info[source], rule.keywords);
      if (matchLength) { score += weight; specificity += matchLength; }
    }
    if (rule.types?.includes(info.type)) score += 80;
    return { key: rule.key, label: rule.label, score, specificity };
  }).sort((a, b) => b.score - a.score || b.specificity - a.specificity || (profile ? Number(Boolean(saf.profileValue(profile, b.key))) - Number(Boolean(saf.profileValue(profile, a.key))) : 0))
    .map(({ key, label, score }) => ({ key, label, score }));
})();
