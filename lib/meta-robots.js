'use strict';

var through = require('through');
var contentTypes = require('./content-types');

module.exports = function(config) {

    function createStream() {
        return through(function(chunk) {
            this.queue(chunk.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>'));
        });
    }

    function metaRobots(data) {
        // this leaks to all sites that are visited by the client & it can block the client from accessing the proxy if https is not avaliable.
        if (contentTypes.shouldProcess(config, data)) {
            data.stream = data.stream.pipe(createStream());
        }
    }

    metaRobots.createStream = createStream; // for testing

    return metaRobots;
};
