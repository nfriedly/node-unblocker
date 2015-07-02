'use strict';

var zlib = require('zlib');
var contentTypes = require('./content-types.js');
var debug = require('debug')('unblocker:decompress');

module.exports = function(config) {

    function decompress(data) {

        if (contentTypes.shouldProcess(config, data) && data.headers['content-encoding'] == 'gzip' || data.headers['content-encoding'] == 'deflate') {
            debug('decompressing %s encoding and deleting content-encoding header', data.headers['content-encoding']);
            delete data.headers['content-encoding'];
            data.stream = data.stream.pipe(zlib.createUnzip());
        }


    }

    return decompress;
};
