"use strict";

module.exports = class PrefixUrlWrapper {
  constructor(proxyUrl, remoteUrl) {
    this.remoteUrl = remoteUrl;
    this.proxyUrl = proxyUrl;
    this.base = this.proxyUrl.href;
    this.prefix = this.proxyUrl.pathname;
    // todo: add support for proxy url on client side
  }

  //   static buildProxyUrl(config, req) {
  //       if (config.origin) {
  //           return new URL(config.origin + config.prefix);
  //       }
  //     // todo: build from config + request if origin is unspecified in config
  //   }

  //   static recoverTargetUrl(prefix, req) {
  //     // todo: move code from unblocker to here
  //   }

  // todo: make separate methods for href (string) and url (obj)?

  parse(url) {
    if (url instanceof URL) {
      return url;
    }
    return new URL(url, this.remoteUrl);
  }

  /**
   * Checks if a given url is wrapped or not
   * @param {string|URL} url
   * @returns {boolean}
   */
  isWrapped(url) {
    if (typeof url === "string") {
      return url.startsWith(this.prefix) || url.startsWith(this.base);
    }
    return (
      url.origin === this.proxyUrl.origin &&
      url.pathname.startsWith(this.prefix)
    );
  }

  /**
   * Checks if a given url needs to be wrapped.
   *
   * Does not check if it is already wrapped.
   *
   * @param {string|URL} url
   * @returns {boolean}
   */
  needsWrapped(url) {
    if (this.isWrapped(url)) {
      return false;
    }
    const urlStr = url.toString();
    return (
      urlStr.startsWith("/") ||
      urlStr.startsWith("http://") ||
      urlStr.startsWith("https://") ||
      urlStr.startsWith("//") ||
      // Sometimes these are OK, but some sites (such as surviv.io) use ../ urls at the root path
      // That would cause something like:
      //   ../img/foo.jpg
      // to be resolved by the browser as:
      //   /proxy/http://img/foo.jpg
      // if we didn't fix it first.
      // todo: parse things and return true/false based on wether or not the result would be valid
      urlStr.startsWith("..")
    );
  }

  wrapSafe(urlStr) {
    // check if it's already proxied (root-relative)
    if (!this.needsWrapped(urlStr)) {
      return urlStr;
    }

    const url = this.parse(urlStr);

    // sometimes websites are tricky and use the current host or hostname + a relative url
    // check hostname (ignoring port)
    if (url.hostname === this.proxyUrl.hostname) {
      // set host (including port)
      url.host = this.remoteUrl.host;
      // also keep the remote site's current protocol
      url.protocol = this.remoteUrl.protocol;
      // todo: handle websocket protocols
    }
    return this.prefix + url.href;
  }

  /**
   * Relatively fast url wrapper.
   * Should be safe for server-generated URLs.
   *
   * @param {string} url
   * @returns {string}
   */
  wrap(url) {
    // todo: avoid parsing if possible
    return this.needsWrapped(url)
      ? this.prefix + new URL(url, this.remoteUrl).href
      : url;
  }
  // todo: isValid check
  // todo: unwrap method
};
