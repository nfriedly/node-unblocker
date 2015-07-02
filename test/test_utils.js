var http = require('http'),
    async = require('async'),
    PassThrough = require('stream').PassThrough,
    app = require('../app'); // false = no redis

exports.getServers = function(sourceContent, charset, next) {
    if (typeof charset == 'function') {
        next = charset;
        charset = false;
    }

    function sendContent(req, res) {
        res.writeHead(200, {
            'content-type': 'text/html' + (charset ? '; charset=' + charset : '')
        });
        res.end(sourceContent);
    }

    var proxyServer = http.createServer(app),
        remoteServer = http.createServer(sendContent);

    proxyServer.setTimeout(5000);
    remoteServer.setTimeout(5000);

    async.parallel([
        proxyServer.listen.bind(proxyServer),
        remoteServer.listen.bind(remoteServer)
    ], function(err) {
        if (err) {
            return next(err);
        }
        var ret = {
            proxyServer: proxyServer,
            proxyPort: proxyServer.address().port,
            remoteServer: remoteServer,
            remotePort: remoteServer.address().port,
            kill: function(next) {
                async.parallel([
                    remoteServer.close.bind(remoteServer),
                    proxyServer.close.bind(proxyServer),
                ], next);
            }
        };
        ret.homeUrl = 'http://localhost:' + ret.proxyPort + '/';
        ret.proxiedUrl = ret.homeUrl + 'proxy/http://localhost:' + ret.remotePort + '/';
        next(null, ret);
    });
};

exports.getData = function(){
    return {
        url: 'http://example.com/',
        contentType: 'text/html',
        headers: {},
        stream: new PassThrough()
    };
};
