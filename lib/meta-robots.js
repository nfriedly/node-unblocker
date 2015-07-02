'use strict';

var through = require('through');

module.exports = function(config) {

    function metaRobots(data, next) {

        // this leaks to all sites that are visited by the client & it can block the client from accessing the proxy if https is not avaliable.
        if (config.processContentTypes.indexOf(data.contentType)) {
            data.stream = data.stream.pipe(through(function(data) {
                this.queue(data.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>'));
            }));
        }

        next();
    }

    return metaRobots;
};
