'use strict';

var zlib = require('zlib');
var contentTypes = require('./content-types.js');
var debug = require('debug')('unblocker:decompress');

module.exports = function(config) {

    function acceptableCompression(data) {
        // deflate is tricky so we're only going to ask for gzip if the client allows it
        if (data.headers['accept-encoding'] && data.headers['accept-encoding'].indexOf('gzip' != -1)) {
            data.headers['accept-encoding'] = 'gzip';
        } else {
            delete data.headers['accept-encoding'];
        }
    }

    function decompressResponse(data) {
        if (contentTypes.shouldProcess(config, data) && data.headers['content-encoding'] == 'gzip' || data.headers['content-encoding'] == 'deflate') {
            debug('decompressing %s encoding and deleting content-encoding header', data.headers['content-encoding']);
            if (data.headers['content-encoding'] == 'deflate') {
                // https://github.com/nfriedly/node-unblocker/issues/12
                // inflateRaw seems to work here wheras inflate and unzip do not.
                // todo: validate this against other sites - if some require raw and others require non-raw, then maybe just rewrite the accept-encoding header to gzip only
                data.stream = data.stream.pipe(zlib.createInflateRaw());
            } else {
                data.stream = data.stream.pipe(zlib.createUnzip());
            }
            delete data.headers['content-encoding'];
        }
    }

    return {
        handleRequest: acceptableCompression,
        handleResponse: decompressResponse
    };
};
