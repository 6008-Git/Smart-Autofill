(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  saf.buildFieldTree = profile => {
    function node(schema, path, trail) {
      const id = path.join(".");
      if (schema.type === "object") {
        const children = [];
        for (const [key, child] of Object.entries(schema.properties)) {
          if (child.fillable === false) continue;
          if (child.type === "records") {
            const rows = saf.getPath(profile, [...path, key]) || [];
            rows.forEach((row, index) => {
              const recordPath = [...path, key, String(index)];
              const label = saf.recordLabel(path[0], row);
              const branch = node(child.item, recordPath, [...trail, label]);
              branch.label = label;
              branch.record = true;
              children.push(branch);
            });
          } else children.push(node(child, [...path, key], [...trail, child.label]));
        }
        return { id, label: schema.label, trail, children, availableCount: children.reduce((sum, child) => sum + child.availableCount, 0) };
      }
      const key = schema.legacyKey || id;
      const resolution = saf.getFieldResolution(profile, key);
      const available = Boolean(resolution.value.trim());
      return { id, key, label: schema.label, trail, available, availableCount: available ? 1 : 0,
        sourceLabel: resolution.derived ? resolution.sourceLabel : "" };
    }
    return saf.GROUPS.map(group => node(saf.PROFILE_SCHEMA.properties[group.key], [group.key], [group.label]));
  };
  saf.flattenFieldTree = tree => tree.flatMap(node => node.children ? saf.flattenFieldTree(node.children) : [node]);
})();
