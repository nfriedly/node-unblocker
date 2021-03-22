export function initWebsockets(config) {
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
