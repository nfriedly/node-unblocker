(function (global) {
  "use strict";

  var unblocker = (global.unblocker = {});

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
  // - fixup writes to document.cookie
  // - run call() and apply() on `this || original_thing`
  // - prevent a failure in one initializer from stopping subsequent initializers
  // - add a getter for parentNode on all direct children of document so things that walk up the tree until they get to document work properly

  function getRemoteHref(config, location) {
    if (location.pathname.substr(0, config.prefix.length) === config.prefix) {
      return (
        location.pathname.substr(config.prefix.length) +
        location.search +
        location.hash
      );
    } else {
      // in case sites (such as youtube) manage to bypass our history wrapper or break the URL some other way
      return config.url;
    }
  }

  function fixUrl(urlStr, config, location) {
    var currentRemoteHref = getRemoteHref(config, location);

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

  // todo: wrap window.navigator.sendBeacon (maybe?)

  // todo: share this with the backend code
  var reCssUrl = /(url\s*\['"]?)([^'")]+)(['"]?\))/gi;
  function fixCSS(css, config) {
    return css.replace(reCssUrl, function (match, open, url, close) {
      return open + fixUrl(url, config, location) + close;
    });
  }

  var urlProps = ["src", "href", "poster", "action", "formaction"];
  var styleProps = ["background", "backgroundImage"];
  // todo: other props:
  // The url() function can be included as a value for background, background-image, list-style, list-style-image, content, cursor,
  // border, border-image, border-image-source, mask, mask-image, src as part of a @font-face block, and @counter-style/symbol
  // https://developer.mozilla.org/en-US/docs/Web/CSS/url()

  function wrapElement(element, wrapChildren, config) {
    if (!element || element.nodeType !== element.ELEMENT_NODE) {
      return;
    }
    if (!element._unblockerWrapped) {
      element._unblockerWrapped = true;
      urlProps.forEach(function (prop) {
        Object.defineProperty(element, prop, {
          set: function (value) {
            delete element[prop]; // remove this setter so we don't get stuck in an infinite loop
            element[prop] = fixUrl(value, config, location);
            // todo: consider restoring the setter in case the client js changes the value later (does that happen?)
          },
          configurable: true,
        });
      });

      var _setAttribute = element.setAttribute;
      element.setAttribute = function (name, value) {
        if (urlProps.indexOf(name) !== -1) {
          value = fixUrl(value, config, location);
        }
        if (name === "style") {
          value = fixCSS(value);
        }
        return _setAttribute.call(this || element, name, value);
      };

      styleProps.forEach(function (prop) {
        Object.defineProperty(element.style, prop, {
          set: function (value) {
            delete element[prop]; // remove this setter so we don't get stuck in an infinite loop
            element[prop] = fixUrl(value, config, location);
            // todo: consider restoring the setter in case the client js changes the value later (does that happen?)
          },
          configurable: true,
        });
      });

      // eslint-disable-next-line no-inner-declarations
      function innerHTMLSetter(value) {
        delete element.innerHTML; // remove this setter so we don't get stuck in an infinite loop
        element.innerHTML = value;
        // this doesn't seem to work for something youtube is doing - element.children is empty even when element.innerHTML shows contents
        wrapElement(element, true, config);
        setupInnerHTMLSetter(); // now put the setter back
      }

      // eslint-disable-next-line no-inner-declarations
      function setupInnerHTMLSetter() {
        Object.defineProperty(element, "innerHTML", {
          set: innerHTMLSetter,
          configurable: true,
        });
      }
      setupInnerHTMLSetter();

      var _cloneNode = element.cloneNode;
      element.cloneNode = function (deep) {
        var clone = _cloneNode.call(this || element, deep);
        wrapElement(clone, deep, config);
        return clone;
      };

      var _appendChild = element.appendChild;
      element.appendChild = function (child) {
        wrapElement(child, true, config);
        return _appendChild.call(this || element, child);
      };

      // todo: test this
      var _append = element.append;
      element.append = function () {
        var args = Array.prototype.slice.call(arguments);
        for (var i = 0; i < args.length; i++) {
          wrapElement(args[i], true, config);
        }
        return _append.apply(this || element, args);
      };

      var _insertBefore = element.insertBefore;
      element.insertBefore = function (newNode, referenceNode) {
        wrapElement(newNode, true, config);
        return _insertBefore.call(this || element, newNode, referenceNode);
      };

      // shadowDom
      // todo: test this
      // todo: wrap customElements.define (maybe?)
      // todo: look at whatever lit does: https://github.com/lit/lit
      if (element.attachShadow) {
        var _attachShadow = element.attachShadow;
        element.attachShadow = function (opts) {
          var shadow = _attachShadow.call(this || element, opts);
          wrapElement(shadow, true, config);
          return shadow;
        };
      }

      // todo: handle srcset
    }

    if (wrapChildren) {
      if (element.children) {
        for (var i = 0; i < element.children.length; i++) {
          wrapElement(element.children[i], wrapChildren, config);
        }
      }
      if (element.content && element.content.children) {
        for (var j = 0; j < element.content.length; j++) {
          wrapElement(element.content[j], wrapChildren, config);
        }
      }
    }
  }

  // this prevents an initial request to the wrong (unproxied) URL
  // it also is important for <img> and <audio> elements that are only created in memory, and never added to the DOM
  function initElementWrapping(config, window) {
    if (!window.document || !window.document.createElement) return;

    // wrap all initial elements
    window.addEventListener("DOMContentLoaded", function () {
      wrapElement(document.documentElement, true, config);
    });

    // wrap all future elements
    var _createElement = window.document.createElement;

    window.document.createElement = function (tagName, options) {
      var element = _createElement.call(window.document, tagName, options);

      if (tagName.toLowerCase() === "iframe") {
        // we can't actually handle iframes here,
        // but now that one is created,
        // we'll wrap document.body.appendChild to handle them
        initAppendBodyIframe(config, window);
      }

      // todo: this should really be applied to *all* elements, not just newly created ones
      wrapElement(element, false, config);

      return element;
    };

    var _importNode = document.importNode;
    document.importNode = function (node, deep) {
      var clone = _importNode.call(this || document, node, deep);
      wrapElement(clone, deep, config);
      return clone;
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
        // update config.url (the remote url) before fixing it to go through the proxy
        config.url = new URL(url, config.url);
        url = fixUrl(url, config, location);
      }
      return _pushState.call(history, state, title, url);
    };

    if (!window.history.replaceState) return;
    var _replaceState = window.history.replaceState;
    window.history.replaceState = function (state, title, url) {
      if (url) {
        config.url = new URL(url, config.url);
        url = fixUrl(url, config, location);
      }
      return _replaceState.call(history, state, title, url);
    };
  }

  function initGlobalProxies(config, window) {
    if (unblocker.window) return;

    /*globals Proxy*/
    if (typeof Proxy === "undefined") {
      unblocker.window = window;
      unblocker.document = document;
      unblocker.location = location;
      return;
    }

    // a lot of native functions really don't like being called on a proxy (e.g. setTimeout)
    // so we'll identify them eagerly (to avoid functions later defined by JS in the site)
    var nativeWindowMethods = [];

    // props that trigger a warning when we call typeof on them
    // none are functions, so we don't care
    var skipProps = [
      // deprecation warning in chrome
      "webkitStorageInfo",
      // deprecation warning in firefox
      "onmozfullscreenchange",
      "onmozfullscreenerror",
      // warning due to forced layout
      "scrollMaxX",
      "scrollMaxY",
    ];

    for (var prop in window) {
      if (skipProps.indexOf(prop) !== -1) {
        continue;
      }
      if (typeof window[prop] === "function") {
        nativeWindowMethods.push(prop);
      }
    }
    // and then bind them lazily, but cache the result
    var boundWindowMethods = {};

    unblocker.window = new Proxy(window, {
      get: function (obj, prop /*, receiver*/) {
        // return our "special" things
        // this is the only part here that we actually want to do,
        // the rest is just necessary to allow this to work
        if (prop === "location") {
          return unblocker.location;
        }
        if (prop === "document") {
          return unblocker.document;
        }

        // handle native methods
        // check the cache first
        if (boundWindowMethods[prop]) {
          return boundWindowMethods[prop];
        }
        // check the list of functions to be bound second, bind and cache if this one is on the list
        if (nativeWindowMethods.includes(prop)) {
          return (boundWindowMethods[prop] = window[prop].bind(window));
        }

        // finally just return the property
        return obj[prop];
      },
      set: function (obj, prop, value) {
        if (prop === "location") {
          unblocker.location.href = value;
          return true;
        }
        return (obj[prop] = value);
      },
    });

    // proxy on {} because some methods on window.location are non-writeable and non-configurable,
    // and proxies force you to return the original method in that case
    unblocker.location = new Proxy(
      {},
      {
        get: function (obj, prop /*, receiver*/) {
          // return wrappers for assign and replace methods
          if (prop === "assign" || prop === "replace") {
            return function (href) {
              return location[prop](fixUrl(href, config, location));
            };
          }
          var targetUrl = new URL(config.url);
          if (prop in targetUrl) {
            return targetUrl[prop];
          }
          return location[prop];
          // try {
          //   return Reflect.get(obj, prop, receiver);
          // } catch (ex) {
          //   console.log(`Unblocker: error reading location.${prop} with Reflect.get(), trying directly.\n`, ex);
          //   return window.location[prop];
          // }
        },
        set: function (obj, prop, value) {
          var targetUrl = new URL(getRemoteHref(config, location));
          if (prop in targetUrl) {
            targetUrl[prop] = value;
            return (window.location = fixUrl(targetUrl.href, config, location));
          }
          return (location[prop] = value);
        },
      }
    );

    // Similar to window, a lot of native functions really don't like being called on a proxy (e.g. addEventListener)
    // so we'll identify them eagerly (to avoid functions later defined by JS in the site)
    var nativeDocumentMethods = [];
    for (var docProp in window.document) {
      if (skipProps.indexOf(docProp) !== -1) {
        continue;
      }
      if (typeof window.document[docProp] === "function") {
        nativeDocumentMethods.push(docProp);
      }
    }
    // and then bind them lazily, but cache the result
    var boundDocumentMethods = {};

    unblocker.document = new Proxy(window.document, {
      get: function (obj, prop /*, receiver*/) {
        // handle things we actually care about
        if (prop === "location") {
          return unblocker.location;
        }

        // handle native methods
        // check the cache first
        if (boundDocumentMethods[prop]) {
          return boundDocumentMethods[prop];
        }
        // check the list of functions to be bound second, bind and cache if this one is on the list
        if (nativeDocumentMethods.includes(prop)) {
          return (boundDocumentMethods[prop] = window.document[prop].bind(
            window.document
          ));
        }

        // todo: document.baseURI

        return obj[prop];
      },
      set: function (obj, prop, value) {
        if (prop === "location") {
          unblocker.location.href = value;
          return true;
        }
        // todo: fixup domain and path on cookies
        return (obj[prop] = value);
      },
    });

    unblocker.maybeGetProxy = function (thing) {
      if (thing === window) {
        return unblocker.window;
      }
      if (thing === document) {
        return unblocker.document;
      }
      if (thing === location) {
        return unblocker.location;
      }
      return thing;
    };
  }

  // function initMutationObserver(config, window) {
  //   if (typeof MutationObserver === 'undefined') {
  //     return;
  //   }

  //   // Select the node that will be observed for mutations
  //   var targetNode = window.document.documentElement;

  //   // Options for the observer (which mutations to observe)
  //   var config = { attributes: true, childList: true, subtree: true };

  //   var handling = true;

  //   var proxyAttributes = ['src','href','action','formaction','poster'];

  //   function fixupNodeAndChildren(node) {
  //     // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
  //     if (node.nodeType !== Node.ELEMENT_NODE) {
  //       return;
  //     }
  //     for(var attr of proxyAttributes) {
  //       if (node[attr]) {
  //         node[attr] = fixUrl(node[attr], config, location)
  //       }
  //       fixupStyle(node);
  //       // todo: srcset
  //       for (var child of node.childNodes) {
  //         fixupNodeAndChildren(child);
  //       }
  //     }
  //   }

  //   function fixupStyle(target) {
  //     var re_url = /url\s*\(['"]?([^'")]+)['"]?\)/ig
  //     target.style.backgroundImage = target.style.backgroundImage.replace(re_url, function(match, url) {
  //       return 'url("' + fixUrl(url, config, location) + '")'
  //     });
  //     // todo: what other CSS properties can have URLs? Fonts?
  //   }

  //   // Callback function to execute when mutations are observed
  //   function handleMutation(mutationsList, observer) {
  //     if (handling) {
  //       return;
  //     }
  //     handling = true;
  //     console.log('mutation list', mutationsList);
  //       // Use traditional 'for loops' for IE 11
  //       for(var mutation of mutationsList) {
  //           if (mutation.type === 'childList' && mutation.addedNodes.length) {
  //               for(var node of mutation.addedNodes) {
  //                 fixupNodeAndChildren(node);
  //               }
  //           }
  //           else if (mutation.type === 'attributes') {
  //             var attr = mutation.attributeName;
  //             var target = mutation.target;
  //             if (proxyAttributes.indexOf(attr) !== -1) {
  //               target[attr] = fixUrl(target[attr], config, location);
  //             } else if (attr === 'style' && target.style.backgroundImage) {
  //               fixupStyle(target);
  //             }
  //             // todo: srcset
  //           }
  //       }
  //     handling = false;
  //   };

  //   // Create an observer instance linked to the callback function
  //   var observer = new MutationObserver(handleMutation);

  //   // Start observing the target node for configured mutations
  //   observer.observe(targetNode, config);
  // }

  var config;
  function initForWindow(_config, window) {
    if (typeof URL === "undefined") {
      // Just about everything else here depends on the URL API
      // TODO: consider including a URL polyfill for IE 11 support (or just use babel + webpack and go all-in on modern JS)
      console.log("Unblocker: unable to initialize due to missing URL API");
      return;
    }
    config = _config;
    console.log("Unblocker: initializing client scripts", config, window);
    initXMLHttpRequest(config, window);
    initFetch(config, window);
    initElementWrapping(config, window);
    initAppendBodyIframe(config, window);
    initWebSockets(config, window);
    initPushState(config, window);
    initGlobalProxies(config, window);
    //initMutationObserver(config, window);
    console.log("Unblocker: client scripts initialized");
  }

  // either export things for testing or put the init method into the global scope to be called
  // with config by the next script tag in a browser
  /*globals module*/
  if (typeof module === "undefined") {
    unblocker.init = initForWindow;
  } else {
    module.exports = {
      initForWindow: initForWindow,
      fixUrl: fixUrl,
    };
  }
})(this); // window in a browser, global in node.js
