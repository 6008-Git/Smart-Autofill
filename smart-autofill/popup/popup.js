(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  const status = document.getElementById("popup-status");
  const summary = document.getElementById("profile-summary");
  function render(profile) {
    summary.replaceChildren();
    for (const key of ["name", "phone", "email", "school"]) {
      const field = saf.FIELD_RULES.find(item => item.key === key);
      const row = document.createElement("div");
      row.className = "summary-row";
      const label = document.createElement("dt");
      label.textContent = field.label;
      const value = document.createElement("dd");
      value.textContent = saf.profileValue(profile, key) || "未设置";
      row.append(label, value);
      summary.append(row);
    }
    const count = saf.getProfileFields(profile).filter(field => saf.profileValue(profile, field.key)).length;
    status.textContent = count ? `已启用 · 可用 ${count} 个字段` : "已启用 · 请先设置个人资料";
  }
  saf.readProfile().then(render, () => { status.textContent = "读取资料失败，请重新打开扩展。"; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.profile) render(saf.normalizeProfile(changes.profile.newValue));
  });
  document.getElementById("manage-button").addEventListener("click", async () => {
    try { await chrome.runtime.openOptionsPage(); window.close(); }
    catch { status.textContent = "无法打开管理页，请重试。"; }
  });
})();
