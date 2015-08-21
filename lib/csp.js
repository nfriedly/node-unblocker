'use strict';

var debug = require('debug')('unblocker:csp');

module.exports = function( /*config*/ ) {

    function csp(data) {
        // not removing csp could potentially prevent clients from using the proxy successfully.
        if (data.headers['content-security-policy']) {
            debug('deleting content-security-policy header');
            delete data.headers['content-security-policy'];
        }
    }

    return csp;
};
