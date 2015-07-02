'use strict';

var zlib = require('zlib');
var contentTypes = require('./content-types.js');

module.exports = function(config) {

    function decompress(data, next) {

        if (contentTypes.shouldProcess(config, data) && data.headers['content-encoding'] == 'gzip' || data.headers['content-encoding'] == 'deflate') {
            delete data.headers['content-encoding'];
            data.stream = data.stream.pipe(zlib.createUnzip());
        }

        next();
    }

    return decompress;
};
