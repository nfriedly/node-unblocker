"use strict";

// occasionally things try to "fix" http:// in the path portion of the URL by merging the slashes and thereby breaking everything
const RE_UNMERGE_SLASHES = /^(https?:\/)([^/])/i;
module.exports = class PrefixUrlWrapper {
  constructor({ prefix, host, proxyUrl, remoteUrl }) {
    if (prefix) {
      // config for global instance
      if (prefix.substr(-1) != "/") {
        prefix += "/";
      }
      this.prefix = prefix;
      this.host = host;
      this.proxyUrl =
        proxyUrl || new URL(`http://${host || "proxy-host.invalid"}${prefix}`);
      // there probably is no remote url, but set up a generic one just in cases
      this.remoteUrl = remoteUrl || new URL("http://remote.invalid");
    } else if (proxyUrl && remoteUrl) {
      // config for per-request instance
      this.remoteUrl = remoteUrl;
      this.proxyUrl = proxyUrl;
      this.prefix = this.proxyUrl.pathname;
    } else {
      throw new Error(
        "PrefixUrlWrapper requires either the prefix option or the proxyURL and remoteUrl options"
      );
    }

    // for convenience
    this.base = this.proxyUrl.href;
    // fix for #74 - fix cases where the /proxy/http:// part occurs twice - can happen with JS that tries to detect the protocol and build a URL from multiple strings
    // accepts 1-3 slashes in the middle (assuming the prefix starts with a slash)
    // note: the prefix only appears in the regex once because the other will have already been trimmed out.
    this.RE_DOUBLE_PREFIX = new RegExp(
      "^https?:/?/?" + this.prefix + "(https?://)",
      "i"
    );
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
  _needsWrapped(url) {
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

  // todo: make client-side code use this
  //   wrapSafe(urlStr) {
  //     // check if it's already proxied (root-relative)
  //     if (!this.needsWrapped(urlStr)) {
  //       return urlStr;
  //     }

  //     const url = this.parse(urlStr);

  //     // sometimes websites are tricky and use the current host or hostname + a relative url
  //     // check hostname (ignoring port)
  //     if (url.hostname === this.proxyUrl.hostname) {
  //       // set host (including port)
  //       url.host = this.remoteUrl.host;
  //       // also keep the remote site's current protocol
  //       url.protocol = this.remoteUrl.protocol;
  //       // todo: handle websocket protocols
  //     }
  //     return this.prefix + url.href;
  //   }

  /**
   * Relatively fast url wrapper.
   * Returns relative urls.
   * Should be safe for server-generated URLs.
   *
   * @param {string} url
   * @returns {string}
   */
  wrap(url) {
    // todo: avoid parsing if possible
    return this._needsWrapped(url)
      ? this.prefix + new URL(url, this.remoteUrl).href
      : url;
  }

  /**
   * Used in cookie paths
   * @param {string} url
   * @returns
   */
  getCookiePath(url) {
    const wrapped = new URL(this.wrapAbsolute(url));
    return wrapped.pathname;
  }

  /**
   * Returns wrapped absolute urls
   * Used in a few places
   * @param {string} url
   * @returns {string}
   */
  wrapAbsolute(url) {
    return this.base + new URL(url, this.remoteUrl).href;
  }

  /**
   * Unwraps and returns remote url if possible, otherwise returns input url as a string.
   * @param {string|URL} url
   * @returns {string}
   */
  unwrap(url) {
    url = url.toString();
    if (url.startsWith(this.prefix)) {
      url = url.substr(this.prefix.length);
    } else if (url.startsWith(this.base)) {
      url = url.substr(this.base.length);
    }

    return url;
  }

  /**
   * Returns true if the given string is a valid, unwrapped, absolute URL
   * @param {string} urlStr
   * @returns {boolean}
   */
  isValid(urlStr) {
    if (
      !urlStr ||
      this.RE_DOUBLE_PREFIX.test(urlStr) ||
      RE_UNMERGE_SLASHES.test(urlStr)
    ) {
      return false;
    }
    // todo: check for trailing slash after domain
    try {
      const urlObj = new URL(urlStr);
      return urlObj.href === urlStr;
    } catch (ex) {
      return false;
    }
  }

  /**
   * Attempts to recover an invalid url from a request object
   *
   * This is what makes this server magic: if we get an unrecognized request that wasn't corrected by
   * proxy's filter, especially when client scripts are disabled.
   * If an unrecognized request comes in, we can check the referrer and potentially figure out the correct url from that.
   * Then unblocker can issue a 307 redirect to the correct address.
   *
   * (307 redirects cause the client to re-use the original method and body at the new location)
   * @param {http.IncomingMessage} request
   * @returns {string|null} unwrapped url
   */
  recover(request) {
    const raw = request.url;
    let url = this.unwrap(raw);
    if (!url) return null;

    // handle js goofing up
    url = url.replace(this.RE_DOUBLE_PREFIX, "$1");

    // handle merged slashes (often caused by reverse proxies)
    url = url.replace(RE_UNMERGE_SLASHES, "$1/$2");

    // this handles things like a missing trailing slash and other gotcha's that the URL class can recover from
    try {
      return new URL(url).href;
    } catch (ex) {
      // that didn't work, try the next thing
    }

    // handle urls that are missing their protocol (e.g. /proxy/example.com instead of /proxy/http://example.com/)
    // todo: consider allowing ws:// and wss:// here
    // todo: check for a valid tld
    if (raw.startsWith(this.prefix) && !url.startsWith("http")) {
      try {
        return new URL("http://" + url).href;
      } catch (ex) {
        // oh well, try the next thing
      }
    }

    // if there is no referer, then either they just got here or we can't help them
    if (!request.headers.referer) {
      return null;
    }

    let ref;
    try {
      ref = new URL(request.headers.referer);
    } catch (ex) {
      // header is missing or invalid, we can't do anything here
      return null;
    }

    // this would indicate that they were referred here from another site,
    // in which case we can't use the referer to determine the correct target
    if (ref.host !== this.host && ref.host !== request.headers.host) {
      return null;
    }

    const unwrappedRef = this.unwrap(ref.pathname + ref.search);
    if (this.isValid(unwrappedRef)) {
      // now we know where they came from, so we can do something for them
      const unwrappedRefUrl = new URL(unwrappedRef);
      return unwrappedRefUrl.origin + raw;
    }

    return null;
  }
};
