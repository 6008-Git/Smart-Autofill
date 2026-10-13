(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  let menu = null;
  let target = null;
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const chevron = direction => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "saf-chevron");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    const shape = direction === "right" ? "M9 5l7 7-7 7" : "M5 9l7 7 7-7";
    path.setAttribute("d", shape);
    path.style.setProperty("d", `path("${shape}")`, "important");
    svg.append(path);
    return svg;
  };
  saf.menuContains = node => Boolean(menu && node && menu.contains(node));
  saf.menuIsVisible = () => Boolean(menu);
  saf.hideMenu = () => { menu?.remove(); menu = null; target = null; };
  saf.positionMenu = () => {
    if (!menu || !target?.isConnected || !saf.isEditableElement(target)) { saf.hideMenu(); return; }
    const rect = target.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) { saf.hideMenu(); return; }
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const desired = menu.dataset.cascadeOpen === "true" ? 470 : 460;
    const placeAbove = desired > below && above > below;
    const available = Math.max(90, Math.min(window.innerHeight - 16, placeAbove ? above : below));
    menu.style.setProperty("max-height", `${available}px`, "important");
    menu.style.setProperty("--saf-column-height", `${Math.max(100, Math.min(240, available - 220))}px`);
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = placeAbove ? rect.top - height - 4 : rect.bottom + 4;
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    menu.style.setProperty("left", `${left}px`, "important");
    menu.style.setProperty("top", `${top}px`, "important");
  };
  saf.focusMenu = () => menu?.querySelector("button:not(:disabled), input")?.focus();
  saf.showMenu = (element, candidates, profile, storageError = "") => {
    saf.hideMenu();
    target = element;
    const root = menu = make("div", "saf-menu");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "个人资料填写候选");
    root.dataset.version = saf.VERSION;
    const title = make("div", "saf-title");
    title.append(make("span", "saf-heading", "选择资料填写"), make("span", "saf-version", saf.VERSION));
    const close = make("button", "saf-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭填写菜单");
    close.addEventListener("click", () => { saf.hideMenu(); element.focus({ preventScroll: true }); });
    title.append(close);
    root.append(title);
    const status = make("p", "saf-status");
    status.setAttribute("role", "status");
    const tree = saf.buildFieldTree(profile);
    let selectedLeaf = null;
    let filling = false;
    let confirm = null;
    async function fillSelected(key) {
      if (filling) return;
      filling = true;
      if (confirm) confirm.disabled = true;
      try {
        const latest = await saf.readProfile();
        if (menu !== root || !element.isConnected) return;
        const value = saf.profileValue(latest, key);
        if (!value.trim()) {
          status.textContent = "这个字段当前没有内容，请在管理页填写后保存。";
          return;
        }
        saf.fillField(element, value);
        saf.hideMenu();
      } catch (error) {
        if (menu === root) status.textContent = /context invalidated|extension.*invalid/i.test(error?.message || "")
          ? "扩展已更新，请刷新当前网页后使用。"
          : error?.message || "无法读取已保存资料，请刷新网页后重试。";
      } finally {
        filling = false;
        if (menu === root) {
          if (confirm) confirm.disabled = !selectedLeaf;
          saf.positionMenu();
        }
      }
    }
    if (storageError) {
      status.textContent = storageError === "invalidated" ? "扩展已更新，请刷新当前网页后使用。" : "无法读取已保存资料，请刷新网页后重试。";
    } else {
      const recommendations = make("div", "saf-recommendations");
      candidates.slice(0, 5).forEach((candidate, index) => {
        if (index === 0) recommendations.append(make("p", "saf-section", candidate.score > 0 ? "推荐" : "常用字段"));
        if (index === 1) recommendations.append(make("p", "saf-section", "其他"));
        const button = make("button", "saf-menu-item");
        button.type = "button";
        button.append(make("span", "saf-label", candidate.label));
        const resolution = saf.getFieldResolution(profile, candidate.key);
        if (!resolution.value.trim()) { button.disabled = true; button.append(make("span", "saf-unset", "暂无内容")); }
        if (resolution.derived) button.title = `来自${resolution.sourceLabel}`;
        button.addEventListener("click", event => { if (event.isTrusted) fillSelected(candidate.key); });
        recommendations.append(button);
      });
      root.append(recommendations);
      const trigger = make("button", "saf-cascade-trigger");
      trigger.type = "button";
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "按分类选择资料字段");
      const triggerLabel = make("span", "saf-trigger-label", "请选择字段");
      trigger.append(triggerLabel, chevron("down"));
      const panel = make("div", "saf-cascade-panel");
      panel.hidden = true;
      const search = make("input", "saf-cascade-search");
      search.type = "search";
      search.placeholder = "搜索中文字段或英文键";
      search.setAttribute("aria-label", "搜索资料字段");
      const columns = make("div", "saf-cascade-columns");
      const trail = make("p", "saf-selected-path", "尚未选择字段");
      trail.setAttribute("role", "status");
      confirm = make("button", "saf-confirm", "填写所选字段");
      confirm.type = "button";
      confirm.disabled = true;
      confirm.addEventListener("click", event => { if (event.isTrusted && selectedLeaf) fillSelected(selectedLeaf.key); });
      panel.append(search, columns);
      root.append(trigger, panel, trail, confirm);
      const branches = [];
      const columnElements = [];
      function selectLeaf(node) {
        if (!node.available) return;
        selectedLeaf = node;
        trail.textContent = node.trail.join(" / ");
        triggerLabel.textContent = node.trail.join(" / ");
        confirm.disabled = false;
        for (const button of columns.querySelectorAll(".saf-cascade-leaf")) {
          button.classList.toggle("saf-active", button.dataset.fieldKey === node.key);
          button.setAttribute("aria-pressed", String(button.dataset.fieldKey === node.key));
        }
      }
      function appendColumn(nodes, level, name, searchResults = false) {
        const column = make("div", "saf-cascade-column");
        column.dataset.level = String(level);
        column.dataset.results = String(searchResults);
        column.setAttribute("role", "group");
        column.setAttribute("aria-label", name);
        column.append(make("div", "saf-column-heading", name));
        if (!nodes.length) column.append(make("p", "saf-empty-column", searchResults ? "没有匹配的字段" : "暂无记录"));
        for (const node of nodes) {
          const branch = Boolean(node.children);
          const button = make("button", `saf-cascade-item ${branch ? "saf-cascade-branch" : "saf-cascade-leaf"}`);
          button.type = "button";
          button.dataset.nodeId = node.id;
          button.dataset.level = String(level);
          if (node.record) button.dataset.record = "true";
          button.title = node.trail.join(" / ") + (node.sourceLabel ? `（来自${node.sourceLabel}）` : "");
          button.setAttribute("aria-label", button.title);
          const label = searchResults ? node.trail.join(" / ") : node.label;
          button.append(make("span", "saf-node-label", label));
          if (branch) {
            button.setAttribute("aria-expanded", "false");
            button.append(make("span", "saf-node-count", String(node.availableCount)), chevron("right"));
            button.addEventListener("mouseenter", event => { if (event.isTrusted) selectBranch(node, level, button); });
          } else {
            button.dataset.fieldKey = node.key;
            button.disabled = !node.available;
            button.setAttribute("aria-pressed", "false");
            if (!node.available) button.append(make("span", "saf-unset", "暂无内容"));
          }
          button.addEventListener("click", event => {
            if (!event.isTrusted) return;
            if (branch) selectBranch(node, level, button);
            else selectLeaf(node);
          });
          button.addEventListener("keydown", event => {
            if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === "ArrowRight" && branch) {
              selectBranch(node, level, button);
              columnElements[level + 1]?.querySelector("button:not(:disabled)")?.focus();
            } else if (event.key === "ArrowLeft" && level > 0) {
              columnElements[level - 1]?.querySelector(".saf-cascade-branch[aria-expanded='true']")?.focus();
            } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
              const controls = Array.from(column.querySelectorAll("button:not(:disabled)"));
              const index = controls.indexOf(button);
              controls[(index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length]?.focus();
            }
          });
          column.append(button);
        }
        columns.append(column);
        columnElements[level] = column;
      }
      function selectBranch(node, level, button) {
        if (branches[level]?.id === node.id) return;
        const focusedLevel = Number(document.activeElement?.dataset?.level);
        if (saf.menuContains(document.activeElement) && focusedLevel > level) button.focus();
        branches.splice(level, branches.length - level, node);
        while (columnElements.length > level + 1) columnElements.pop().remove();
        for (const control of columnElements[level].querySelectorAll(".saf-cascade-branch")) {
          const active = control.dataset.nodeId === node.id;
          control.classList.toggle("saf-active", active);
          control.setAttribute("aria-expanded", String(active));
        }
        selectedLeaf = null;
        confirm.disabled = true;
        trail.textContent = node.trail.join(" / ");
        triggerLabel.textContent = "请选择字段";
        appendColumn(node.children, level + 1, node.record ? "资料字段" : node.label);
        saf.positionMenu();
      }
      function resetColumns() {
        columns.replaceChildren();
        columnElements.length = 0;
        branches.length = 0;
        appendColumn(tree, 0, "资料分类");
      }
      trigger.addEventListener("click", event => {
        if (!event.isTrusted) return;
        const open = panel.hidden;
        panel.hidden = !open;
        root.dataset.cascadeOpen = String(open);
        trigger.setAttribute("aria-expanded", String(open));
        if (open && !columnElements.length) resetColumns();
        saf.positionMenu();
      });
      search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        if (!query) resetColumns();
        else {
          columns.replaceChildren();
          branches.length = 0;
          columnElements.length = 0;
          const results = saf.flattenFieldTree(tree).filter(node => `${node.trail.join(" ")} ${node.key}`.toLowerCase().includes(query));
          appendColumn(results, 0, `搜索结果 · ${results.length} 项`, true);
        }
        saf.positionMenu();
      });
      search.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          columns.querySelector("button:not(:disabled)")?.focus();
        }
      });
      if (!saf.flattenFieldTree(tree).some(node => node.available)) status.textContent = "先在管理页填写并保存个人资料。";
    }
    const manage = make("button", "saf-manage", "管理个人资料");
    manage.type = "button";
    manage.addEventListener("click", async event => {
      if (!event.isTrusted) return;
      try {
        const response = await chrome.runtime.sendMessage({ action: "open-options" });
        if (!response?.ok) throw new Error();
        saf.hideMenu();
      } catch { status.textContent = "无法打开管理页，请点击浏览器扩展图标。"; }
    });
    root.append(status, manage);
    root.addEventListener("pointerdown", event => { if (event.target.closest("button")) event.preventDefault(); });
    root.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || event.target.matches("input, .saf-cascade-item")) return;
      const controls = Array.from(root.querySelectorAll("button:not(:disabled), input")).filter(control => !control.closest("[hidden]"));
      const index = controls.indexOf(document.activeElement);
      controls[(index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length]?.focus();
      event.preventDefault();
    });
    document.documentElement.append(root);
    saf.positionMenu();
  };
})();
