var URL = require('url');
var libCookie = require('cookie');
var setCookie = require('set-cookie-parser');
var TLD = require('tld');
var through = require('through');
var contentTypes = require('./content-types.js');
var debug = require('debug')('unblocker:cookies');

/**
 * Forwards cookies on to client, rewriting domain and path to match site's "directory" on proxy server.
 *
 * Gets a bit hackey when switching protocols or subdomains - cookies are copied over to the new "directory" but flags such as httponly and expires are lost and path is reset to site root
 *
 * Todo: consider creating an extra cookie to hold flags for other cookies when switching protocols or subdomains
 *
 * @param config
 */

function cookies(config) {

    var REDIRECT_QUERY_PARAM = '__proxy_cookies_to';

    // normally we do nothing here, but when the user is switching protocols or subdomains, the handleResponse function
    // will rewrite the links to start with the old protocol & domain (so that we get sent the cookies), and then it
    // will copy the old cookies to the new path
     function redirectCookiesWith(data) {
        var uri = URL.parse(data.url, true); // true = parseQueryString
        if (uri.query[REDIRECT_QUERY_PARAM]) {
            var nextUri = URL.parse(uri.query[REDIRECT_QUERY_PARAM]);
            debug('copying cookies from %s to %s', data.url, uri.query[REDIRECT_QUERY_PARAM]);
            var cookies = libCookie.parse(data.headers.cookie || '');
            var setCookieHeaders = Object.keys(cookies).map(function(name) {
                var value = cookies[name];
                return libCookie.serialize(name, value, {path: config.prefix + nextUri.protocol +'//'+ nextUri.host + '/'});
            });
            data.clientResponse.redirectTo(uri.query.__proxy_cookies_to, {'set-cookie': setCookieHeaders});
        }

         // todo: copy cookies over from clientRequest when the remote server sends a 3xx redirect to a differnet protocol / subdomain
    }

    function rewriteCookiesAndLinks(data) {
        var uri = URL.parse(data.url);

        // first update any set-cookie headers to ensure the path is prefixed with the site
        var cookies = setCookie.parse(data);
        if(cookies.length) {
            debug('remaping set-cookie headers');
            data.headers['set-cookie'] = cookies.map(function(cookie) {
                cookie.path = config.prefix + uri.protocol +'//'+ uri.host + (cookie.path || '/');
                delete cookie.domain;
                delete cookie.secure; // todo: maybe leave this if we knot the proxy is being accessed over https?
                return libCookie.serialize(cookie.name, cookie.value, cookie);
            });
        }

        // next scan the links for anything that switches subdomain or protocol (if this is a content-type that we want to process
        if (contentTypes.shouldProcess(config, data)) {

            var tld = TLD.registered(uri.hostname);

            data.stream = data.stream.pipe(through(function(chunk){
                this.queue(chunk.replace(new RegExp(config.prefix + "(https?://([a-z0-9.-]+\.)?" + tld + "[^'\") ]*)", "ig"), function(proxiedUrl, url /*, subdomain*/) {
                    var next_uri = URL.parse(url);
                    if (next_uri.protocol != uri.protocol || next_uri.host != uri.host) {
                        // rewrite the url - we want the old proto and domain, but the new path just in case there are any cookies that are limited to that sub-path (although they won't be on the new protodomain...)
                        var cookieProxiedUrl = config.prefix + uri.protocol + '//' + uri.host + next_uri.pathname + '?' + REDIRECT_QUERY_PARAM + '=' + encodeURIComponent(url);
                        debug('rewriting link from %s to %s in order to allow cookies to be copied over to new path', proxiedUrl, cookieProxiedUrl);
                        return cookieProxiedUrl;
                    } else {
                        // if neither the proto nor the host have changed, just replace it with the same string
                        return proxiedUrl;
                    }
                }));
            }));
        }
    }

    return {
        handleRequest: redirectCookiesWith,
        handleResponse: rewriteCookiesAndLinks
    };
}


module.exports = cookies;
