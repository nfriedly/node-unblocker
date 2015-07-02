'use strict';

var debug = require('debug')('proxyReferer');

module.exports = function (/*config*/) {

    function proxyReferer(data, next) {
        // overwrite the referer with the correct referer
        if (data.headers.referer) {
            var ref = data.headers.referer;
            var base = data.clientRequest.thisSite();
            if (ref.indexOf(base) === 0) {
                data.headers.referer = ref.substr(0, base.length);
            } else if (ref.indexOf(base.replace('http:', 'https:')) === 0) {
                data.headers.referer = ref.substr(0, base.length + 1);
            }
            if (data.headers.referer != ref) {
                debug("referer header rewritten from %s to %s", ref, data.headers.referer);
            }
        }
        next();
    }

    return proxyReferer;
};
