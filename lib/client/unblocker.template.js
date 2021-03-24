(function (exports) {
  "use strict";

  console.log("begin unblocker client scripts");

  const config = { prefix: "PREFIX" };

  function fixUrl(target, prefix, location) {
    const currentRemoteHref =
      location.pathname.substr(prefix.length) + location.search + location.hash;
    const url = new URL(target, currentRemoteHref);

    //todo: handle already proxied urls (will be important for checking current dom)

    // don't break data: urls
    if (url.protocol === "data:") {
      return target;
    }

    // sometimes websites are tricky
    // check hostname (ignoring port)
    if (url.hostname === location.hostname) {
      const currentRemoteUrl = new URL(currentRemoteHref);
      // set host (including port)
      url.host = currentRemoteUrl.host;
      // also keep the remote site's current protocol
      url.protocol = currentRemoteUrl.protocol;
      // todo: handle websocket protocols
    }
    return prefix + url.href;
  }

  function initXMLHttpRequest(config) {
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

  function initCreateElement({ prefix }) {
    const _createElement = document.createElement;

    document.createElement = function (tagName, options) {
      const element = _createElement.call(document, tagName, options);
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

  function initWebsockets(config) {
    var _WebSocket = WebSocket;
    var prefix = config.prefix;
    var proxyHost = location.host;
    var isSecure = location.protocol === "https";
    var target = location.pathname.substr(prefix.length);
    var targetURL = new URL(target);

    // ws:// or wss:// then at least one char for location,
    // then either the end or a path
    var reWsUrl = /^ws(s?):\/\/([^/]+)($|\/.*)/;

    window.WebSocket = function (url, protocols) {
      var parsedUrl = url.match(reWsUrl);
      if (parsedUrl) {
        var wsSecure = parsedUrl[1];
        // force downgrade if wss:// is called on insecure page
        // (in case the proxy only supports http)
        var wsProto = isSecure ? "ws" + wsSecure + "://" : "ws://";
        var wsHost = parsedUrl[2];
        // deal with "relative" js that uses the current url rather than a hard-coded one
        if (wsHost === location.host || wsHost === location.hostname) {
          // todo: handle situation where ws hostname === location.hostname but ports differ
          wsHost = targetURL.host;
        }
        var wsPath = parsedUrl[3];
        // prefix the websocket with the proxy server
        return new _WebSocket(
          wsProto +
            proxyHost +
            prefix +
            "http" +
            wsSecure +
            "://" +
            wsHost +
            wsPath
        );
      }
      // fallback in case the regex failed
      return new _WebSocket(url, protocols);
    };
  }

  initWebsockets(config);
  initXMLHttpRequest(config);
  initCreateElement(config);

  console.log("unblocker client scripts initialized");

  // export things for testing if loaded via commonjs
  exports.fixUrl = fixUrl;
  /*globals module*/
})((typeof module === "object" && module.exports) || {});
