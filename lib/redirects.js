'use strict';

var debug = require('debug')('unblocker:redirects');

module.exports = function (config) {
    function proxyRedirects(data) {

        // fix absolute url redirects
        // (relative redirects will be re-redirected to the correct path, and they're disallowed by the RFC anyways
        // todo: also fix refresh and url headers
        if (data.headers.location && data.headers.location.substr(0, 4) == 'http') {
            // yep, I'm using a disallowed format too...
            var location = config.prefix + data.headers.location;
            debug('rewriting redirect from %s to %s', data.headers.location, location);
            data.headers.location = location;
        }


    }

    return proxyRedirects;
};
