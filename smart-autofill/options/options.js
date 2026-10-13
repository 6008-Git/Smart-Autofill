(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  const form = document.getElementById("profile-form");
  const fields = document.getElementById("profile-fields");
  const navigation = document.getElementById("section-nav");
  const saveButton = document.getElementById("save-button");
  const saveStatus = document.getElementById("save-status");
  const backupStatus = document.getElementById("backup-status");
  const exportButton = document.getElementById("export-button");
  const importFile = document.getElementById("import-file");
  const preview = document.getElementById("import-preview");
  const confirmImport = document.getElementById("confirm-import");
  let draft = saf.emptyProfile();
  let pendingImport = null;
  let dirty = false;
  let busy = false;
  let loaded = false;
  const opened = new Set(["basic"]);
  const message = (element, text, error = false) => {
    element.textContent = text;
    element.classList.toggle("is-error", error);
  };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function readForm() {
    const profile = saf.normalizeProfile(draft);
    for (const control of fields.querySelectorAll("[data-field-path]")) {
      const path = control.dataset.fieldPath.split(".");
      // Displayed defaults remain linked to their source; do not save stale duplicate copies.
      if (control.dataset.derivedFrom && !control.dataset.userEdited && control.value === control.dataset.derivedDisplay) continue;
      let value = control.value;
      if (control.dataset.fieldType === "list") {
        const original = saf.getPath(draft, path);
        value = value === original.join("\n") ? [...original] : value === "" ? [] : value.split("\n");
      }
      saf.setPath(profile, path, value);
    }
    return profile;
  }
  function setBusy(value) {
    busy = value;
    saveButton.disabled = value || !loaded;
    exportButton.disabled = value || !loaded;
    importFile.disabled = value || !loaded;
    confirmImport.disabled = value;
    for (const control of fields.querySelectorAll("input, textarea, button")) control.disabled = value || !loaded;
  }
  function markDirty() { dirty = true; message(saveStatus, "有未保存的修改"); }
  function updateDerivedControl(control, profile) {
    const resolution = saf.getFieldResolution(profile, control.dataset.legacyKey);
    control.value = resolution.value;
    const hint = document.getElementById(`${control.id}-source`);
    if (resolution.derived) {
      control.dataset.derivedFrom = resolution.sourcePath;
      control.dataset.derivedDisplay = resolution.value;
      hint.textContent = `来自${resolution.sourceLabel}；编辑可单独覆盖，清空后恢复来源默认。`;
      hint.hidden = false;
    } else {
      delete control.dataset.derivedFrom;
      delete control.dataset.derivedDisplay;
      hint.textContent = "";
      hint.hidden = true;
    }
  }
  function refreshDerivedControls(profile) {
    for (const control of fields.querySelectorAll("[data-legacy-key]")) {
      const linked = control.dataset.derivedFrom && !control.dataset.userEdited && control.value === control.dataset.derivedDisplay;
      if (linked || !control.value) { delete control.dataset.userEdited; updateDerivedControl(control, profile); }
    }
  }
  const statsText = stats => stats.hasData ? `${stats.records ? stats.records + " 条 · " : ""}${stats.available} 项可用` : "未提供";
  function updateStats(profile) {
    for (const stats of saf.groupStats(profile)) {
      for (const badge of document.querySelectorAll(`[data-stats-group="${stats.key}"]`)) badge.textContent = statsText(stats);
    }
    for (const heading of fields.querySelectorAll("[data-record-heading]")) {
      const label = saf.recordLabel(heading.dataset.recordGroup, saf.getPath(profile, heading.dataset.recordHeading.split(".")));
      heading.textContent = label;
      heading.title = label;
      heading.parentElement.querySelector(".remove-record").setAttribute("aria-label", `删除${label}`);
    }
  }
  function editRecords(path, schema, index = null) {
    if (busy || !loaded) return;
    draft = readForm();
    const rows = saf.getPath(draft, path);
    if (index === null) {
      if (rows.length >= 100) { message(saveStatus, "每类经历最多 100 条。", true); return; }
      rows.push(saf.emptySchema(schema.item));
    } else rows.splice(index, 1);
    opened.add(path[0]);
    markDirty();
    render();
    const selector = index === null ? `[data-field-path^="${path.join(".")}.${rows.length - 1}."]` : `[data-add-records="${path.join(".")}"]`;
    fields.querySelector(selector)?.focus();
  }
  function renderNode(schema, path, container) {
    if (schema.type === "object") {
      const nested = make("div", "nested-section");
      nested.append(make("h3", "nested-title", schema.label));
      renderProperties(schema.properties, path, nested);
      container.append(nested);
      return;
    }
    if (schema.type === "records") {
      const list = make("div", "record-list");
      const rows = saf.getPath(draft, path);
      rows.forEach((row, index) => {
        const record = make("div", "record-card");
        const header = make("div", "record-header");
        const remove = make("button", "remove-record", "删除这条");
        remove.type = "button";
        const recordLabel = saf.recordLabel(path[0], row);
        remove.setAttribute("aria-label", `删除${recordLabel}`);
        remove.title = "保存后生效";
        remove.addEventListener("click", () => editRecords(path, schema, index));
        const heading = make("h3", "", recordLabel);
        heading.dataset.recordHeading = [...path, String(index)].join(".");
        heading.dataset.recordGroup = path[0];
        heading.title = recordLabel;
        header.append(heading, remove);
        record.append(header);
        renderProperties(schema.item.properties, [...path, String(index)], record);
        list.append(record);
      });
      if (!rows.length) list.append(make("p", "empty-records", "还没有记录，点击下方按钮添加，或导入 JSON。"));
      const add = make("button", "add-record", `新增${schema.label}`);
      add.type = "button";
      add.dataset.addRecords = path.join(".");
      add.addEventListener("click", () => editRecords(path, schema));
      list.append(add);
      container.append(list);
      return;
    }
    const label = make("label", "field" + (schema.multiline || schema.type === "list" ? " field-wide" : ""), schema.label);
    const control = make(schema.multiline || schema.type === "list" ? "textarea" : "input", "");
    if (control.tagName === "INPUT") control.type = "text";
    else control.rows = schema.type === "list" ? 4 : 3;
    control.id = `profile-${schema.legacyKey || path.join("-")}`;
    control.name = schema.legacyKey || path.join(".");
    control.dataset.fieldPath = path.join(".");
    control.dataset.fieldType = schema.type;
    if (schema.legacyKey) control.dataset.legacyKey = schema.legacyKey;
    control.maxLength = schema.type === "list" ? 200000 : 10000;
    control.spellcheck = false;
    const value = saf.getPath(draft, path);
    control.value = schema.type === "list" ? value.join("\n") : value;
    if (["birthday", "enrollmentDate", "graduationDate"].includes(path.at(-1))) control.placeholder = "例如：2000-01-01";
    if (["phone", "postalCode"].includes(path.at(-1))) control.inputMode = "numeric";
    label.append(control);
    if (schema.legacyKey) {
      const hint = make("span", "field-hint field-source");
      hint.id = `${control.id}-source`;
      label.append(hint);
      control.setAttribute("aria-describedby", hint.id);
      const resolution = saf.getFieldResolution(draft, schema.legacyKey);
      if (resolution.derived) {
        control.value = resolution.value;
        control.dataset.derivedFrom = resolution.sourcePath;
        control.dataset.derivedDisplay = resolution.value;
        hint.textContent = `来自${resolution.sourceLabel}；编辑可单独覆盖，清空后恢复来源默认。`;
      } else hint.hidden = true;
    }
    if (schema.type === "list") label.append(make("span", "field-hint", "每行一项；填写网页时按换行连接。"));
    container.append(label);
  }
  function renderProperties(properties, path, container) {
    const grid = make("div", "field-grid");
    for (const [key, schema] of Object.entries(properties)) {
      if (["object", "records"].includes(schema.type)) {
        const block = make("div", "field-wide");
        renderNode(schema, [...path, key], block);
        grid.append(block);
      } else renderNode(schema, [...path, key], grid);
    }
    container.append(grid);
  }
  function render(revealPopulated = false) {
    for (const section of fields.querySelectorAll("details[data-group]")) {
      if (section.open) opened.add(section.dataset.group);
      else opened.delete(section.dataset.group);
    }
    fields.replaceChildren();
    navigation.replaceChildren();
    const statistics = saf.groupStats(draft);
    for (const group of saf.GROUPS) {
      const stats = statistics.find(item => item.key === group.key);
      const section = make("details", "profile-section");
      section.dataset.group = group.key;
      section.id = `section-${group.key}`;
      section.open = opened.has(group.key) || revealPopulated && stats.hasData;
      const summary = make("summary", "section-heading");
      summary.append(make("h2", "", group.label));
      const badge = make("span", "section-count", statsText(stats));
      badge.dataset.statsGroup = group.key;
      summary.append(badge);
      const note = make("p", "section-note", group.note);
      section.append(summary, note);
      renderProperties(saf.PROFILE_SCHEMA.properties[group.key].properties, [group.key], section);
      fields.append(section);
      const link = make("a", "section-link", group.label);
      const navCount = make("span", "nav-count", statsText(stats));
      navCount.dataset.statsGroup = group.key;
      link.append(navCount);
      link.href = `#${section.id}`;
      link.addEventListener("click", () => { section.open = true; opened.add(group.key); });
      navigation.append(link);
    }
    setBusy(busy);
  }
  function writeForm(profile) { draft = saf.normalizeProfile(profile); dirty = false; render(true); }
  function clearImport() { pendingImport = null; preview.hidden = true; importFile.value = ""; }
  form.addEventListener("input", event => {
    if (event.target.dataset.legacyKey) {
      event.target.dataset.userEdited = "true";
      if (!event.target.value.trim()) saf.setPath(draft, event.target.dataset.fieldPath.split("."), "");
      delete event.target.dataset.derivedFrom;
      delete event.target.dataset.derivedDisplay;
      const hint = document.getElementById(`${event.target.id}-source`);
      hint.textContent = event.target.value && saf.COMMON_FIELD_SOURCES[event.target.dataset.legacyKey] ? "单独维护的值；清空后恢复来源默认。" : "";
      hint.hidden = !hint.textContent;
    }
    markDirty();
    const profile = readForm();
    refreshDerivedControls(profile);
    updateStats(profile);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !loaded) return;
    const profile = readForm();
    setBusy(true);
    message(saveStatus, "正在保存资料…");
    try {
      const valid = saf.parseImport(JSON.stringify({ version: saf.PROFILE_VERSION, profile }));
      await saf.saveProfile(valid);
      draft = valid;
      dirty = false;
      render();
      message(saveStatus, "资料已保存到本地浏览器");
    } catch (error) { message(saveStatus, `保存失败：${error.message || "请重试"}。修改仍保留在页面中。`, true); }
    finally { setBusy(false); }
  });
  exportButton.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    try {
      const profile = await saf.readProfile();
      const blob = new Blob([JSON.stringify({ version: saf.PROFILE_VERSION, profile }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = make("a", "");
      link.href = url;
      link.download = "smart-autofill-profile.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(backupStatus, dirty ? "已导出已保存资料；页面中未保存的修改未包含在备份中。" : "已导出已保存资料。");
    } catch { message(backupStatus, "导出失败，请重试。", true); }
    finally { setBusy(false); }
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    if (!file) return;
    clearImport();
    setBusy(true);
    try {
      if (file.size > 1024 * 1024) throw new Error("文件过大，请导入小于 1 MB 的资料 JSON。");
      pendingImport = saf.parseImport(await file.text());
      const statistics = saf.groupStats(pendingImport);
      const count = statistics.reduce((sum, group) => sum + group.available, 0);
      const records = statistics.reduce((sum, group) => sum + group.records, 0);
      const breakdown = document.getElementById("import-breakdown");
      breakdown.replaceChildren();
      for (const group of statistics.filter(item => item.hasData)) breakdown.append(make("li", "", `${group.label}：${statsText(group)}`));
      document.getElementById("import-summary").textContent = `已解析 ${count} 个有内容的字段、${records} 条经历记录。确认后替换全部资料，未提供的字段清空${dirty ? "，未保存的修改也将被替换" : ""}。`;
      preview.hidden = false;
      message(backupStatus, "请确认导入，当前资料尚未更改。");
    } catch (error) { message(backupStatus, error.message, true); }
    finally { setBusy(false); if (pendingImport) confirmImport.focus(); }
  });
  confirmImport.addEventListener("click", async () => {
    if (!pendingImport || busy) return;
    setBusy(true);
    try {
      await saf.saveProfile(pendingImport);
      writeForm(pendingImport);
      clearImport();
      message(saveStatus, "导入的资料已保存到本地浏览器");
      message(backupStatus, "导入完成。");
    } catch { message(backupStatus, "导入保存失败，原资料未被替换，请重试。", true); }
    finally { setBusy(false); if (!pendingImport) saveButton.focus(); }
  });
  document.getElementById("cancel-import").addEventListener("click", () => {
    if (busy) return;
    clearImport();
    message(backupStatus, "已取消导入。");
    importFile.focus();
  });
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.profile || busy) return;
    if (dirty) { message(saveStatus, "另一管理页更新了资料。当前修改尚未保存，保存后将覆盖该更新。"); return; }
    writeForm(saf.normalizeProfile(changes.profile.newValue));
    message(saveStatus, "资料已从本地浏览器更新");
  });
  render();
  saf.readProfile().then(profile => {
    loaded = true;
    writeForm(profile);
    fields.setAttribute("aria-busy", "false");
    message(saveStatus, "资料保存在本地，编辑后请点击保存");
  }, () => { fields.setAttribute("aria-busy", "false"); message(saveStatus, "无法读取资料，请刷新此页后重试。", true); });
})();
