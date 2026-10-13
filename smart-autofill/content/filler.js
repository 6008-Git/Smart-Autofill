(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  saf.fillField = (element, value) => {
    if (!saf.isEditableElement(element) || !element.isConnected) throw new Error("当前输入框不可填写，请重新选择。");
    const view = element.ownerDocument.defaultView;
    const prototype = element.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
    const previous = element.value;
    setter.call(element, String(value));
    if (element.type === "number" && element.value === "" && String(value) !== "") {
      setter.call(element, previous);
      throw new Error("该输入框仅接受数字，请选择其他字段。");
    }
    element.focus({ preventScroll: true });
    element.dispatchEvent(new view.Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new view.Event("change", { bubbles: true, composed: true }));
  };
})();
