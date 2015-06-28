var through = require('through');
var PassThrough = require('stream').PassThrough;
var iconv = require('iconv-lite');
var contentType = require('content-type');


// content-types that might possibly have the charset in a meta tag
function mayContainMeta(type) {
    var types = [
        'text/html',
        'application/xml+xhtml',
        'application/xhtml+xml'
    ];

    return types.indexOf(type) != -1
}


function getEncodingPair(charset) {
    return {
        decode: iconv.decodeStream(charset),
        recode: iconb.encodeStream(charset)
    }
}

// still needs to stringify the binary chunks
function getStringifyPair() {
    return {
        decode: through(function(chunk) {
            this.queue(chunk.toString());
        }),
        recode: new PassThrough();
    }
}


function createStreams(content_type_header) {
    try {
        var ct = contentType.parse(content_type_header); // this throws if the header is missing or invalid
        var charset = ct.parameters.charset;

        if (iconv.encodingExists(charset) ) {
            return getEncodingPair(charset)
        } else if (mayContainMeta(ct.type)){
            var buff = new Buffer();
            var isEncoding = false;
            var pair;
            function handleChunkDecode(chunk) {
                if (isEncoding) {
                    return pair.decode.write(chunk);
                }
                buff = Buffer.concat([buff, chunk]);
                var str =  buff.toString();
                var charsetMatch = str.match(/<meta [^>]*charset=['"]?([^ '">]+)/)
                if (charsetMatch) {
                    charset = charsetMatch[1]
                    if (iconv.encodingExists(charset) ) {
                        isEncoding = true;
                        pair = getEncodingPair(charset);
                        // set up forwarding
                        pair.decode.on('data', function(chunk) {
                            this.queue(chunk);
                        });
                        pair.decode.write(buff);
                        buff = null;

                    } else if
                }

            }
            function handleEndDecode() {
                this.queue(buff);
            }
            function handleChunkRecode(chunk) {

            }
            function handleEndRecode() {
                this.queue(buff);
            }
            va
            var decode = new through(handleChunkDecode, handleEndDecode);

        }

    }



}


module.exports.createStreams = createStreams;
