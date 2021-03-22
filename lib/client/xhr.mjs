import { fixUrl } from "./fix-url.mjs";

export function initXMLHttpRequest(config) {
  const _XMLHttpRequest = XMLHttpRequest;

  window.XMLHttpRequest = function (opts) {
    const xhr = new _XMLHttpRequest(opts);
    const _open = xhr.open;
    xhr.open = function () {
      const args = Array.prototype.slice.call(arguments);
      args[1] = fixUrl(args[1], config.prefix, location);
      return _open.apply(xhr, args);
    };
    return xhr;
  };
}
