export function initXMLHttpRequest(config) {
    var _XMLHttpRequest = XMLHttpRequest;
    var prefix = config.prefix;
    var proxyHost = location.host;
    var isSecure = location.protocol === "https";
    var target = location.pathname.substr(prefix.length);
    var targetURL = new URL(target);
    var re_http = /^https?:\/\//i

    window.XMLHttpRequest = function (opts) {
      var xhr = new _XMLHttpRequest(opts);
      var _open = xhr.open;
      xhr.open = function(method, url, async, user, password) {
        if (url.substr(0,1) === '/') {
          url = prefix + targetURL.protocol + '/' + targetURL.host + url;
        } else if (re_http.test(url)) {
          url = prefix + url;
        }
        return _open.call(xhr, method, url, async, user, password)
      }
      return xhr;
    };
  }
  