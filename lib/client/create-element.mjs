import { fixUrl } from "./fix-url.mjs";

export function createElement({ prefix }) {
  const _createElement = document.createElement;

  document.createElement = function (tagName, options) {
    const element = new _createElement.call(document, tagName, options);
    // todo: whitelist elements with href or src attributes and only check those
    setTimeout(() => {
      if (element.src) {
        element.src = fixUrl(element.src, prefix, location);
      }
      if (element.href) {
        element.href = fixUrl(element.href, prefix, location);
      }
      // todo: support srcset and ..?
    }, 0);
    // todo: handle urls that aren't set immediately
    return element;
  };
}
