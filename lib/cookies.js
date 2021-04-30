"use strict";

const libCookie = require("cookie");
const setCookie = require("set-cookie-parser");
const TLD = require("tld");
const debug = require("debug")("unblocker:cookies");
const _ = require("lodash");

/**
 * Forwards cookies on to client, rewriting domain and path to match site's "directory" on proxy server.
 *
 * Gets a bit hackey when switching protocols or subdomains - cookies are copied over to the new "directory" but flags such as httponly and expires are lost and path is reset to site root
 *
 * Todo: consider creating an extra cookie to hold flags for other cookies when switching protocols or subdomains
 */

const REDIRECT_QUERY_PARAM = "__proxy_cookies_to";

// normally we do nothing here, but when the user is switching protocols or subdomains, the handleResponse function
// will rewrite the links to start with the old protocol & domain (so that we get sent the cookies), and then it
// will copy the old cookies to the new path
function redirectCookiesWith(data) {
  const nextHref = data.url.searchParams.get(REDIRECT_QUERY_PARAM);
  if (nextHref) {
    const nextUri = new URL(nextHref, "http://href.invalid");
    debug("copying cookies from %s to %s", data.url, nextHref);
    const cookies = libCookie.parse(data.headers.cookie || "");
    const setCookieHeaders = Object.keys(cookies).map(function (name) {
      const value = cookies[name];
      return libCookie.serialize(name, value, {
        path: data.urlWrapper.getCookiePath(nextUri.origin),
      });
    });
    data.clientResponse.redirectTo(nextHref, {
      "set-cookie": setCookieHeaders,
    });
  }

  // todo: copy cookies over from clientRequest when the remote server sends a 3xx redirect to a differnet protocol / subdomain
}

// normally libCookie.serialize passes values through encodeURIComponent, but a custom encoder may be provided to prevent that
// see https://www.npmjs.com/package/cookie#encode
function noChange(value) {
  return value;
}

function rewriteCookiesAndLinks(data) {
  const nextUri =
    data.headers.location &&
    new URL(data.urlWrapper.unwrap(data.headers.location));

  // first update any set-cookie headers to ensure the path is prefixed with the site
  const cookies = setCookie.parse(data, {
    decodeValues: false, // normally it calls decodeURIComponent on each value - but we want to just pass them along unchanged in this case.
  });
  if (cookies.length) {
    debug("remaping set-cookie headers");
    data.headers["set-cookie"] = cookies.map(function (cookie) {
      const targetUri = nextUri || data.url;
      cookie.path = data.urlWrapper.getCookiePath(
        new URL(cookie.path || "/", targetUri)
      );
      delete cookie.domain;
      if (cookie.secure) {
        // todo: maybe leave this if we know the proxy is being accessed over https?
        delete cookie.secure;
        delete cookie.sameSite; // the 'None' option requires 'Secure'
      }
      cookie.encode = noChange;
      return libCookie.serialize(cookie.name, cookie.value, cookie);
    });
  }

  // next, if this is a redirect, see if we need to copy any cookies over to the new domain
  if (nextUri) {
    const diffProto = nextUri.protocol != data.url.protocol;
    const diffHost = nextUri.hostname != data.url.hostname;
    // if protocol or hostname are changing, but the registered tld is the same, copy the cookies over to the new "path"
    if (
      (diffProto || diffHost) &&
      TLD.registered(nextUri.hostname) == TLD.registered(data.url.hostname)
    ) {
      debug("copying cookies from %s to %s", data.url, nextUri.href);

      // get all of the old cookies (from the request) indexed by name, and create set-cookie headers for each one
      const oldCookies = libCookie.parse(
        data.clientRequest.headers.cookie || ""
      );
      const oldSetCookieHeaders = _.mapValues(
        oldCookies,
        function (value, name) {
          return libCookie.serialize(name, value, {
            path: data.urlWrapper.getCookiePath(nextUri.origin),
          });
        }
      );

      // but, if we have a new cookie with the same name as an old one, delete the old one
      cookies.forEach(function (cookie) {
        delete oldSetCookieHeaders[cookie.name];
      });

      // finally, append the remaining old cookie headers to any existing set-cookie headers in the response
      data.headers["set-cookie"] = (data.headers["set-cookie"] || []).concat(
        _.values(oldSetCookieHeaders)
      );
    }
  }

  // next scan the links for anything that switches subdomain or protocol (if this is a content-type that we want to process
  if (data.html) {
    const tld = TLD.registered(data.url.hostname);
    data.html.on("wrap", (e) => {
      if (e.unwrapped !== e.wrapped) {
        const target = new URL(e.unwrapped, data.url);
        if (
          target.hostname.endsWith(tld) &&
          tld === TLD.registered(target.hostname)
        ) {
          // if this link is on the same TLD, but switches protocol and/or subdomain
          // make it first go through the cookie handler on the current protocol/sub
          // and then redirect with the cookies coppied over
          if (
            target.hostname !== data.url.hostname ||
            target.protocol !== data.url.protocol
          ) {
            const cookieProxiedUrl =
              data.urlWrapper.getCookiePath(data.url) +
              "?" +
              REDIRECT_QUERY_PARAM +
              "=" +
              encodeURIComponent(e.unwrapped);
            debug(
              "rewriting link from %s to %s in order to allow cookies to be copied over to new path",
              e.wrapped,
              cookieProxiedUrl
            );
            e.wrapped = cookieProxiedUrl;
          }
        }
      }
    });
  }
}

module.exports = {
  handleRequest: redirectCookiesWith,
  handleResponse: rewriteCookiesAndLinks,
};
