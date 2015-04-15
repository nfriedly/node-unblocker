var through = require('through');

function createStream() {
    return through(function(data) {
        this.queue(data.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>\n</head>'));
    });
}

module.exports.createStream = createStream;
