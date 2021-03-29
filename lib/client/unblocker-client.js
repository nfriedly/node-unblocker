(function (global) {
  "use strict";

  // todo:
  // - postMessage
  // - open
  // - DOM Mutation Observer
  //   - href
  //   - src
  //   - srcset
  //   - style (this could get tricky...)
  //   - poster (on <video> elements)
  //   - perhaps some/all of this could be shared by the server-side url-rewriter
  // - split each part into separate files (?)
  // - wrap other JS and provide proxies to fix writes to window.location and document.cookie
  //   - will require updating contentTypes.html.includes(data.contentType) to include js
  //   - that, in turn will require decompressing js....
  // call() and apply() on `this || original_thing`
  // prevent a failure in one initializer from stopping subsequent initializers

  function fixUrl(urlStr, config, location) {
    var currentRemoteHref;
    if (location.pathname.substr(0, config.prefix.length) === config.prefix) {
      currentRemoteHref =
        location.pathname.substr(config.prefix.length) +
        location.search +
        location.hash;
    } else {
      // in case sites (such as youtube) manage to bypass our history wrapper
      currentRemoteHref = config.url;
    }

    // check if it's already proxied (root-relative)
    if (urlStr.substr(0, config.prefix.length) === config.prefix) {
      return urlStr;
    }

    var url = new URL(urlStr, currentRemoteHref);

    // check if it's already proxied (absolute)
    if (
      url.origin === location.origin &&
      url.pathname.substr(0, config.prefix.length) === config.prefix
    ) {
      return urlStr;
    }

    // don't break data: urls, about:blank, etc
    // todo: do modify ws: and wss: protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return urlStr;
    }

    // sometimes websites are tricky and use the current host or hostname + a relative url
    // check hostname (ignoring port)
    if (url.hostname === location.hostname) {
      var currentRemoteUrl = new URL(currentRemoteHref);
      // set host (including port)
      url.host = currentRemoteUrl.host;
      // also keep the remote site's current protocol
      url.protocol = currentRemoteUrl.protocol;
      // todo: handle websocket protocols
    }
    return config.prefix + url.href;
  }

  function initXMLHttpRequest(config, window) {
    if (!window.XMLHttpRequest) return;
    var _XMLHttpRequest = window.XMLHttpRequest;

    window.XMLHttpRequest = function (opts) {
      var xhr = new _XMLHttpRequest(opts);
      var _open = xhr.open;
      xhr.open = function () {
        var args = Array.prototype.slice.call(arguments);
        args[1] = fixUrl(args[1], config, location);
        return _open.apply(xhr, args);
      };
      return xhr;
    };
  }

  function initFetch(config, window) {
    if (!window.fetch) return;
    var _fetch = window.fetch;

    window.fetch = function (resource, init) {
      if (resource.url) {
        resource.url = fixUrl(resource.url, config, location);
      } else {
        resource = fixUrl(resource.toString(), config, location);
      }
      return _fetch(resource, init);
    };
  }

  // this prevents an initial request to the wrong (unproxied) URL
  // it also is important for <img> and <audio> elements that are only created in memory, and never added to the DOM
  function initCreateElement(config, window) {
    if (!window.document || !window.document.createElement) return;
    var _createElement = window.document.createElement;

    window.document.createElement = function (tagName, options) {
      if (tagName.toLowerCase() === "iframe") {
        initAppendBodyIframe(config, window);
      }
      var element = _createElement.call(window.document, tagName, options);
      Object.defineProperty(element, "src", {
        set: function (src) {
          delete element.src; // remove this setter so we don't get stuck in an infinite loop
          element.src = fixUrl(src, config, location);
        },
        configurable: true,
      });
      // todo: let a DOM mutation observer handle href attributes when they're added to the document
      Object.defineProperty(element, "href", {
        set: function (href) {
          delete element.href; // remove this setter so we don't get stuck in an infinite loop
          element.href = fixUrl(href, config, location);
        },
        configurable: true,
      });
      // todo: consider restoring the setter in case the client js changes the value later (does that happen?)
      return element;
    };
  }

  // js on some sites, such as youtube, uses an iframe to grab native APIs such as history, so we need to fix those also.
  // document.body isn't available when this script is first executed,
  // so we'll also try when createElement is called, but set a flag to ensure it only installs once
  function initAppendBodyIframe(config, window) {
    if (
      !window.document ||
      !window.document.body ||
      !window.document.body.appendChild ||
      window.document.body.unblockerIframeAppendListenerInstalled
    ) {
      return;
    }

    var _appendChild = window.document.body.appendChild;

    window.document.body.appendChild = function (element) {
      var ret = _appendChild.call(window.document.body, element);
      if (
        element.tagName &&
        element.tagName.toLowerCase() === "iframe" &&
        element.src === "about:blank" &&
        element.contentWindow
      ) {
        initForWindow(config, element.contentWindow);
      }
      return ret;
    };
    window.document.body.unblockerIframeAppendListenerInstalled = true;
  }

  function initWebSockets(config, window) {
    if (!window.WebSocket) return;
    var _WebSocket = window.WebSocket;
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

  // todo: figure out how youtube bypasses this
  // notes: look at bindHistoryStateFunctions_ - it looks like it checks the contentWindow.history of an iframe *fitst*, then it's __proto__, then the global history api
  //        - so, we need to inject this into iframes also
  function initPushState(config, window) {
    if (!window.history || !window.history.pushState) return;

    var _pushState = window.history.pushState;
    window.history.pushState = function (state, title, url) {
      if (url) {
        url = fixUrl(url, config, location);
        config.url = new URL(url, config.url);
        return _pushState.call(history, state, title, url);
      }
    };

    if (!window.history.replaceState) return;
    var _replaceState = window.history.replaceState;
    window.history.replaceState = function (state, title, url) {
      if (url) {
        url = fixUrl(url, config, location);
        config.url = new URL(url, config.url);
        return _replaceState.call(history, state, title, url);
      }
    };
  }

  function initForWindow(config, window) {
    console.log("begin unblocker client scripts", config, window);
    initXMLHttpRequest(config, window);
    initFetch(config, window);
    initCreateElement(config, window);
    initAppendBodyIframe(config, window);
    initWebSockets(config, window);
    initPushState(config, window);
    if (window === global) {
      // leave no trace
      delete global.unblockerInit;
    }
    console.log("unblocker client scripts initialized");
  }

  // either export things for testing or put the init method into the global scope to be called
  // with config by the next script tag in a browser
  /*globals module*/
  if (typeof module === "undefined") {
    global.unblockerInit = initForWindow;
  } else {
    module.exports = {
      initForWindow: initForWindow,
      fixUrl: fixUrl,
    };
  }
})(this); // window in a browser, global in node.js
