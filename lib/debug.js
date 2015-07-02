var through = require('through');
var crypto = require('crypto');
var _ = require('lodash');

function getDebugMiddlewareFor(middleware, dir) {
    var nextName = middleware && (middleware.name || middleware.toString());
    return function debugMiddleware(data, next) {
        var prevMiddleware = data.middlewareName;
        if(!prevMiddleware) {
            console.log('starting %s middleware stack for %s %s', dir, data.contentType || '', data.url);
            data.prevStream = null;
            data.stream.on('end', console.log.bind(console, 'stream ended'));
        }
        if (!data.prevStream || (data.prevStream && data.stream != data.prevStream)) {
            console.log ('stream added');
            data.prevStream = data.stream = data.stream.pipe(through(function(chunk) {
                var hash = crypto.createHash('sha1').update(chunk).digest('hex');
                console.log('%s %s chunk received from %s, length=%s, hash=%s', data.url, dir, prevMiddleware || 'source', chunk.length, hash);
                if (data.prevHash && hash != data.prevHash) {
                    console.log('chunk modified by ' + prevMiddleware);
                }
                data.hash = hash;
                this.queue(chunk);
            }));
        }
        if (nextName) {
            console.log('setting up ' + nextName);
            data.middlewareName = nextName;
        }
        if (prevMiddleware && !nextName) {
            console.log('all ' + dir + ' middleware setup');
        }
        next();
    }
}
function debugStack (middleware, dir) {
    return _(middleware).map(function(m) {
        return [getDebugMiddlewareFor(m, dir), m];
    }).flatten().push(getDebugMiddlewareFor(null, dir)).value();
}

module.exports = debugStack;
