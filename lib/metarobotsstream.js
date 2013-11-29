var through = require('through-stream');

function createStream() {
    return through(function(data, buf) {
        buf.push(data.replace('</head>', '<meta name="ROBOTS" content="NOINDEX, NOFOLLOW">\n</head>'));
    });
}

module.exports.createStream = createStream;