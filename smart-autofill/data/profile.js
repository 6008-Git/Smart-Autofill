(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  saf.PROFILE_VERSION = 2;
  saf.getPath = (value, path) => path.reduce((node, key) => node?.[key], value);
  saf.setPath = (value, path, content) => {
    let node = value;
    for (let index = 0; index < path.length - 1; index++) {
      const key = path[index];
      if (!own(node, key)) node[key] = /^\d+$/.test(String(path[index + 1])) ? [] : {};
      node = node[key];
    }
    node[path.at(-1)] = content;
  };
  saf.emptySchema = schema => {
    if (schema.type === "text") return "";
    if (["list", "records"].includes(schema.type)) return [];
    return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, saf.emptySchema(child)]));
  };
  saf.emptyProfile = () => saf.emptySchema(saf.PROFILE_SCHEMA);
  function normalize(schema, value) {
    if (schema.type === "text") return typeof value === "string" ? value : "";
    if (schema.type === "list") return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
    if (schema.type === "records") return Array.isArray(value) ? value.filter(isObject).map(item => normalize(schema.item, item)) : [];
    return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, normalize(child, isObject(value) ? value[key] : undefined)]));
  }
  // Recognize explicit source annotations, not meaningful qualifications such as （中级）.
  saf.inspectFieldText = (value, singleValue = false) => {
    const original = String(value || "");
    let annotated = false;
    let alternative = false;
    let text = original.replace(/[（(]([^（）()]*)[）)]/g, (match, inner) => {
      const source = /^(?:(?:信息\d+(?:详细)?|详细)?表单(?:$|中(?:亦)?写作|填写值|填|选|[\u4e00-\u9fffA-Za-z0-9]{0,12}字段(?:填|选))|网申$|简历$)/.test(inner.trim());
      if (!source) return match;
      annotated = true;
      return "";
    });
    text = text.replace(/(^|[;；\n])\s*[\p{L}\p{N} _-]{0,16}表单(?:填写|填|选(?:择)?|写(?:作)?)\s*[「『“"]([^」』”"\n]+)[」』”"]/gu,
      (_match, separator, content) => { annotated = true; alternative = true; return separator + content; });
    if (!annotated) return { value: original, annotated: false, conflict: false };
    text = text.replace(/[ \t]+(?=[;；/])/g, "").replace(/(?<=[;；/])[ \t]+/g, " ").trim();
    const choices = text.split(/[;；\n]/).map(part => part.trim()).filter(Boolean);
    const conflict = singleValue && alternative && new Set(choices).size > 1;
    return { value: conflict ? "" : text, annotated: true, conflict };
  };
  saf.cleanFieldText = value => saf.inspectFieldText(value).value;
  saf.normalizeProfile = value => {
    const profile = normalize(saf.PROFILE_SCHEMA, value);
    function walk(schema, data, path = [], record = null) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (child.fillable === false) continue;
        if (child.type === "text" || child.type === "list") {
          const entries = child.type === "list" ? data[key] : [data[key]];
          data[key] = entries.map(entry => {
            const cleaned = saf.inspectFieldText(entry, child.singleValue);
            if (cleaned.annotated) {
              const note = `${cleaned.conflict ? "待确认 · " : "导入说明 · "}${child.label}：${entry}`;
              if (note.length > 10000) throw new Error("原始表单说明过长，请先整理资料后再导入。");
              if (record && own(record, "notes")) {
                if (!record.notes.split("\n").includes(note)) {
                  const combined = record.notes + `${record.notes ? "\n" : ""}${note}`;
                  if (combined.length > 10000) throw new Error("备注与原始表单说明合计过长，请先整理资料后再导入。");
                  record.notes = combined;
                }
              } else {
                const sources = profile[path[0]]?.dataSources;
                if (sources && !sources.includes(note)) {
                  if (sources.length >= 200) throw new Error("数据来源与原始表单说明超过 200 项，请先整理资料后再导入。");
                  sources.push(note);
                }
              }
            }
            return cleaned.value;
          });
          if (child.type === "text") data[key] = data[key][0];
        } else if (child.type === "records") data[key].forEach((row, index) => walk(child.item, row, [...path, key, String(index)], row));
        else walk(child, data[key], [...path, key], record);
      }
    }
    walk(saf.PROFILE_SCHEMA, profile);
    if (JSON.stringify({ version: saf.PROFILE_VERSION, profile }).length > 1024 * 1024) throw new Error("整理后的资料超过 1 MB，请减少长文本后再导入。");
    return profile;
  };
  // Only identifying snippets are shown on the webpage; never use contact numbers or whole descriptions.
  saf.recordLabel = (group, record = {}) => {
    const identityKeys = {
      educationHistory: ["school", "educationLevel", "major", "dateRange"],
      workExperience: ["company", "position", "dateRange", "employmentType"],
      family: ["relationship", "name", "employer"],
      certificates: ["name", "obtainedDate", "score"],
      awards: ["name", "awardedDate", "level"],
      publications: ["title", "journalName", "publishedDate"],
      projects: ["name", "role", "dateRange"]
    };
    const clip = (text, limit) => {
      const letters = Array.from(text);
      return letters.length > limit ? letters.slice(0, limit - 1).join("") + "…" : text;
    };
    const parts = (identityKeys[group] || []).map(key => typeof record[key] === "string" ? saf.cleanFieldText(record[key]).replace(/\s+/g, " ").trim() : "")
      .filter(Boolean).map(text => clip(text, 36));
    const fallback = (saf.GROUPS.find(item => item.key === group)?.label || "记录") + "（待补充名称）";
    return parts.length ? clip([...new Set(parts)].join(" · "), 90) : fallback;
  };
  saf.parseDateRange = value => {
    const result = [];
    const pattern = /(?<!\d)(\d{4})(?:[年.\/-](0?[1-9]|1[0-2])(?!\d)月?(?:(?:[.\/-]|(?<=月))(0?[1-9]|[12]\d|3[01])(?!\d)日?)?)?(?!\d)/g;
    for (const match of String(value || "").matchAll(pattern)) {
      const [, year, month, day] = match;
      result.push({ value: [year, month?.padStart(2, "0"), day?.padStart(2, "0")].filter(Boolean).join("-"),
        order: Number(year) * 10000 + Number(month || 0) * 100 + Number(day || 0) });
    }
    return result;
  };
  function latestRecord(rows, meaningfulKeys) {
    let best = null;
    (rows || []).forEach((record, index) => {
      if (!meaningfulKeys.some(key => record[key]?.trim())) return;
      const order = saf.parseDateRange(record.dateRange)[0]?.order || 0;
      if (!best || order > best.order || order === best.order && index > best.index) best = { record, index, order };
    });
    return best;
  }
  saf.COMMON_FIELD_SOURCES = {
    school: ["educationHistory.records.*.school"], college: ["educationHistory.records.*.college"],
    major: ["educationHistory.records.*.major"], educationLevel: ["educationHistory.records.*.educationLevel"], degree: ["educationHistory.records.*.degree"],
    enrollmentDate: ["educationHistory.records.*.dateRange"], graduationDate: ["educationHistory.records.*.dateRange"],
    expectedPosition: ["job.targetPositions", "job.appliedPosition"], expectedCity: ["job.preferredWorkCities", "job.campusApplication.preferredCities"],
    currentCompany: ["workExperience.records.*.company"], currentPosition: ["workExperience.records.*.position"],
    province: ["location.currentResidence"], city: ["location.currentResidence"], address: ["location.currentResidence"]
  };
  saf.getFieldResolution = (profile, key) => {
    const legacy = saf.FIELD_RULES.find(item => item.key === key || `${item.group}.${item.key}` === key);
    const path = legacy ? [legacy.group, legacy.key] : key.split(".");
    let schema = saf.PROFILE_SCHEMA;
    for (const part of path) schema = schema?.type === "records" && /^\d+$/.test(part) ? schema.item : schema?.properties?.[part];
    if (schema?.fillable === false) return { value: "", derived: false, sourceLabel: "", sourcePath: path.join(".") };
    const stored = saf.getPath(profile, path);
    const value = Array.isArray(stored) ? stored.map(saf.cleanFieldText).join("\n") : typeof stored === "string" ? saf.inspectFieldText(stored, schema?.singleValue).value : "";
    if (value.trim() || !legacy) return { value, derived: false, sourceLabel: "", sourcePath: path.join(".") };
    const from = (content, sourcePath, sourceLabel) => ({ value: saf.cleanFieldText(content), derived: Boolean(content), sourcePath, sourceLabel });
    if (legacy.group === "education") {
      const selected = latestRecord(profile?.educationHistory?.records, ["school", "college", "major", "educationLevel", "degree", "dateRange"]);
      if (selected) {
        const { record, index } = selected;
        if (["enrollmentDate", "graduationDate"].includes(legacy.key)) {
          const dates = saf.parseDateRange(record.dateRange);
          const date = legacy.key === "enrollmentDate" ? dates[0]?.value : dates.length > 1 ? dates.at(-1).value : "";
          return from(date, `educationHistory.records.${index}.dateRange`, `${saf.recordLabel("educationHistory", record)} · 起止时间`);
        }
        return from(record[legacy.key], `educationHistory.records.${index}.${legacy.key}`, `${saf.recordLabel("educationHistory", record)} · ${legacy.label}`);
      }
    }
    if (["expectedPosition", "expectedCity"].includes(legacy.key)) {
      for (const source of saf.COMMON_FIELD_SOURCES[legacy.key]) {
        const candidate = saf.getPath(profile, source.split("."));
        const text = Array.isArray(candidate) ? candidate.filter(item => item.trim()).join("、") : candidate || "";
        if (text) return from(text, source, { "job.targetPositions": "目标岗位", "job.appliedPosition": "求职岗位", "job.preferredWorkCities": "期望工作城市", "job.campusApplication.preferredCities": "校园招聘投递 · 意向工作城市" }[source]);
      }
    }
    if (["currentCompany", "currentPosition"].includes(legacy.key)) {
      const rows = profile?.workExperience?.records || [];
      const ongoing = latestRecord(rows.map(record => /至今|现在|在职|\bpresent\b|\bcurrent\b|\bongoing\b/i.test(record.dateRange) && !record.departureReason?.trim() ? record : {}), ["company", "position"]);
      if (ongoing) {
        const sourceKey = legacy.key === "currentCompany" ? "company" : "position";
        return from(ongoing.record[sourceKey], `workExperience.records.${ongoing.index}.${sourceKey}`, `${saf.recordLabel("workExperience", ongoing.record)} · ${sourceKey === "company" ? "公司" : "职位"}（至今）`);
      }
    }
    if (legacy.group === "location") {
      const residence = profile?.location?.currentResidence || "";
      if (legacy.key === "address") return from(residence, "location.currentResidence", "现居住地");
      const municipality = residence.match(/^(北京市|上海市|天津市|重庆市)/)?.[1];
      const region = residence.match(/^([\u4e00-\u9fff]{2,12}?(?:省|自治区|特别行政区))([\u4e00-\u9fff]{2,10}?(?:市|自治州|地区|盟))?/);
      if (["province", "city"].includes(legacy.key)) return from(municipality || (legacy.key === "province" ? region?.[1] : region?.[2]), "location.currentResidence", "现居住地中的明确省市");
    }
    return { value, derived: false, sourceLabel: "", sourcePath: path.join(".") };
  };
  saf.schemaDescriptors = () => {
    const result = [];
    function walk(schema, path, context, labels) {
      const file = schema.sourceFile || context.file;
      const prefix = schema.sourceFile && schema.sourceFile !== context.file ? [] : context.sourcePath;
      const sourcePath = schema.source === null ? prefix : [...prefix, schema.source];
      if (schema.type === "object") {
        for (const [key, child] of Object.entries(schema.properties)) walk(child, [...path, key], { file, sourcePath }, path.length ? [...labels, schema.label] : labels);
      } else if (schema.type === "records") {
        for (const [key, child] of Object.entries(schema.item.properties)) walk(child, [...path, "*", key], { file, sourcePath: [...sourcePath, "*"] }, labels);
      } else {
        result.push({ path, group: path[0], label: schema.label, labels, schema,
          sourceFile: schema.source !== null ? file : null, sourcePath });
      }
    }
    walk(saf.PROFILE_SCHEMA, [], { file: null, sourcePath: [] }, []);
    return result;
  };
  saf.getProfileFields = profile => {
    const fields = saf.FIELD_RULES.map(rule => ({ ...rule, path: [rule.group, rule.key] }));
    for (const descriptor of saf.schemaDescriptors()) {
      if (descriptor.schema.legacyKey || descriptor.schema.fillable === false) continue;
      const { schema, path, group } = descriptor;
      const wildcard = path.indexOf("*");
      const rows = wildcard === -1 ? [null] : Array.from(saf.getPath(profile, path.slice(0, wildcard)) || [], (_item, index) => index);
      for (const index of rows) {
        const concrete = path.map(part => part === "*" ? String(index) : part);
        const groupLabel = saf.GROUPS.find(item => item.key === group).label;
        const nested = descriptor.labels.slice(1).join(" · ");
        const row = wildcard === -1 ? null : saf.getPath(profile, [...path.slice(0, wildcard), String(index)]);
        const label = wildcard === -1 ? `${nested ? nested + " · " : ""}${schema.label}` : `${groupLabel} · ${saf.recordLabel(group, row)} · ${schema.label}`;
        fields.push({ key: concrete.join("."), path: concrete, group, label,
          keywords: schema.keywords || [schema.label, path.at(-1)], autocomplete: schema.autocomplete, types: schema.types });
      }
    }
    return fields;
  };
  saf.profileValue = (profile, key) => {
    return saf.getFieldResolution(profile, key).value;
  };
  saf.groupStats = profile => {
    const fields = saf.getProfileFields(profile);
    return saf.GROUPS.map(group => {
    const available = fields.filter(field => field.group === group.key && saf.profileValue(profile, field.key).trim()).length;
    const records = profile?.[group.key]?.records?.length || 0;
    return { key: group.key, label: group.label, available, records, hasData: available > 0 || records > 0 };
    });
  };
  saf.readProfile = async () => saf.normalizeProfile((await chrome.storage.local.get("profile")).profile);
  saf.saveProfile = async profile => chrome.storage.local.set({ profile: saf.normalizeProfile(profile) });
  saf.parseImport = text => {
    if (text.length > 1024 * 1024) throw new Error("文件过大，请导入小于 1 MB 的资料 JSON。");
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("JSON 格式不正确，请检查文件。"); }
    if (!isObject(data)) throw new Error("资料必须是 JSON 对象。");
    if (own(data, "profile")) {
      if (Object.keys(data).some(key => !["profile", "version"].includes(key))) throw new Error("文件包含不支持的顶层字段。");
      if (own(data, "version") && ![1, 2].includes(data.version)) throw new Error("不支持的资料版本。");
      data = data.profile;
    }
    if (!isObject(data) || !Object.keys(data).length) throw new Error("文件没有可导入的个人资料字段。");
    const profile = saf.emptyProfile();
    const seen = new Set();
    function validate(schema, value, path) {
      const label = schema.label;
      if (schema.type === "text") {
        if (seen.has(path.join("."))) throw new Error(`字段重复：${label}。请使用一种资料格式。`);
        seen.add(path.join("."));
        if (typeof value !== "string") throw new Error(`${label}必须是文本，请用引号包裹号码和日期。`);
        if (value.length > 10000) throw new Error(`${label}内容过长（最多 10000 字符）。`);
        return value;
      }
      if (schema.type === "list") {
        if (!Array.isArray(value) || value.length > 200 || value.some(item => typeof item !== "string" || item.length > 10000)) throw new Error(`${label}必须是文本数组，最多 200 项，每项最多 10000 字符。`);
        return [...value];
      }
      if (schema.type === "records") {
        if (!Array.isArray(value) || value.length > 100) throw new Error(`${label}必须是记录数组，最多 100 条。`);
        return value.map((item, index) => validate(schema.item, item, [...path, String(index)]));
      }
      if (!isObject(value)) throw new Error(`${label}必须是对象。`);
      const result = saf.emptySchema(schema);
      for (const [key, item] of Object.entries(value)) {
        if (!own(schema.properties, key)) throw new Error(`不支持字段：${[...path, key].join(".")}`);
        result[key] = validate(schema.properties[key], item, [...path, key]);
      }
      return result;
    }
    for (const [key, value] of Object.entries(data)) {
      const legacy = saf.FIELD_RULES.find(field => field.key === key);
      if (legacy) {
        const schema = saf.PROFILE_SCHEMA.properties[legacy.group].properties[key];
        profile[legacy.group][key] = validate(schema, value, [legacy.group, key]);
      } else if (own(saf.PROFILE_SCHEMA.properties, key)) {
        const incoming = validate(saf.PROFILE_SCHEMA.properties[key], value, [key]);
        for (const child of Object.keys(value)) profile[key][child] = incoming[child];
      } else throw new Error(`不支持字段：${key}。请使用个人资料中定义的英文键。`);
    }
    return saf.normalizeProfile(profile);
  };
})();
