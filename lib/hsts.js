'use strict';

module.exports = function(/*config*/) {

    function hsts(data, next) {

        // this leaks to all sites that are visited by the client & it can block the client from accessing the proxy if https is not avaliable.
        if (data.headers['strict-transport-security']) {
            delete data.headers['strict-transport-security'];
        }

        next();
    }

    return hsts;
};
