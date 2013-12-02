var fs = require('fs'),
    path = require("path"),
    zlib = require('zlib'),
    util = require('util'),

    async = require('async'),
    mime = require('mime'),

    package_info = require('../package.json'),
    googleAnalytics = require('./googleanalyticsstream');


function setGa(ga) {
    googleAnalytics = ga;
}

// memoize = cache the results so that the file is only loaded from the hdd once
var getRawFile = async.memoize(function(name, cb) {
    fs.readFile(path.join(__dirname, '../public/', name), function(err, data) {
        if (err) {
            return cb(err);
        }
        var uncompressed = data.toString();
        uncompressed = uncompressed.replace('{version}', package_info.version)
        uncompressed = googleAnalytics.addGa(uncompressed);
        return cb(null, uncompressed);
    });
});


var DEFLATE = 'deflate',
    GZIP = 'gzip';
var getCompressedFile = async.memoize(function(file, compression, cb) {
    getRawFile(file, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (compression == DEFLATE) zlib.deflate(data, cb);
        else if (compression == GZIP) zlib.gzip(data, cb);
        else process.nextTick(cb.bind(cb, null, data));
    });
});

function serveStatic(request, response) {

    var headers = {
        "content-type": mime.lookup(request.url)
    };

    if ((request.headers['accept-encoding'] || '')
        .match(/\bdeflate\b/)) {
        headers['content-encoding'] = DEFLATE;
    } else if ((request.headers['accept-encoding'] || '')
        .match(/\bgzip\b/)) {
        headers['content-encoding'] = GZIP;
    }

    getCompressedFile(request.url, headers['content-encoding'], function(err, data) {
        if (err) {
            response.writeHead(500, {
                "content-type": "text/plain"
            });
            return response.end(util.inspect(err));
        }
        response.writeHead(200, headers);
        response.end(data);
    });
}

module.exports = serveStatic;
module.exports.setGa = setGa;
