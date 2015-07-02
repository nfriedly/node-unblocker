'use strict';

module.exports = function(/*config*/) {

    function contentLength(data) {

        // if any of the middleware is possibly changing the body, remove the content-length header
        if (data.stream != data.remoteResponse) {
            delete data.headers['content-length'];
        }
        next();
    }

    return contentLength;
};
