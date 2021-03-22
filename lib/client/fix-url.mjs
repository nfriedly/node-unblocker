export function fixUrl(target, prefix, location) {
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
