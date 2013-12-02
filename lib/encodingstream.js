var through = require('through'),
    _ = require('underscore'),
    Iconv = require('iconv')
        .Iconv;

// charset aliases which charset supported by native node.js
var charset_aliases = {
    'ascii': 'ascii',
    'us': 'ascii',
    'us-ascii': 'ascii',
    'utf8': 'utf8',
    'utf-8': 'utf8',
    'ucs-2': 'ucs2',
    'ucs2': 'ucs2',
    'csunicode': 'ucs2',
    'iso-10646-ucs-2': 'ucs2'
};

// charset aliases which iconv doesn't support
// this is popular jp-charset only, I think there are more...
var charset_aliases_iconv = {
    'windows-31j': 'cp932',
    'cswindows31j': 'cp932',
    'ms932': 'cp932'
};

function createStreams(content_type) {
    // if charset is utf8, chunk may be cut in the middle of 3byte character,
    // we need to buffer the cut data and prepend it to the next chunk
    var chunk_remainder_bin;

    // detect charset from content-type headers
    var charset = content_type.match(/\bcharset=([\w\-]+)\b/i);
    charset = charset ? normalizeIconvCharset(charset[1].toLowerCase()) : undefined;

    // Iconv instance for decode and encode
    var decodeIconv, encodeIconv;

    // decode chunk binary to string using charset
    function decodeChunk(chunk) {
        // if charset is undefined, detect from meta headers
        if (!charset) {
            var re = chunk.toString()
                .match(/<meta\b[^>]*charset=([\w\-]+)/i);
            // if we can't detect charset, use utf-8 as default
            // CAUTION: this will become a bug if charset meta headers are not contained in the first chunk, but probability is low
            charset = re ? normalizeIconvCharset(re[1].toLowerCase()) : 'utf-8';
        }
        //console.log("charset: " + charset);

        if (charset in charset_aliases) {
            return chunk.toString(charset_aliases[charset]);
        } else {
            if (!decodeIconv) decodeIconv = new Iconv(charset, 'UTF-8//TRANSLIT//IGNORE');
            return decodeIconv.convert(chunk)
                .toString();
        }
    }

    function handleRemainder(chunk) {
        if (chunk_remainder_bin) {
            var buf = new Buffer(chunk_remainder_bin.length + chunk.length);
            chunk_remainder_bin.copy(buf);
            chunk.copy(buf, chunk_remainder_bin.length);
            chunk_remainder_bin = undefined;
            chunk = buf;
        }
        if (charset_aliases[charset] === 'utf8') {
            var cut_size = utf8_cutDataSizeOfTail(chunk);
            //console.log('cut_size = ' + cut_size);
            if (cut_size > 0) {
                chunk_remainder_bin = new Buffer(cut_size);
                chunk.copy(chunk_remainder_bin, 0, chunk.length - cut_size);
                chunk = chunk.slice(0, chunk.length - cut_size);
            }
        }
        return chunk;
    }


    // encode chunk string to binary using charset
    function encodeChunk(chunk) {
        if (charset in charset_aliases) {
            return new Buffer(chunk, charset_aliases[charset]);
        } else {
            if (!encodeIconv) encodeIconv = new Iconv('UTF-8', charset + '//TRANSLIT//IGNORE');
            return encodeIconv.convert(chunk);
        }
    }


    var streams = {
        decode: through(function(data) {
            data = handleRemainder(decodeChunk(data));
            this.queue(data);
        }),
        recode: through(function(data) {
            data = encodeChunk(data);
            this.queue(data);
        })
    };

    return streams;
}

// normalize charset which iconv doesn't support
function normalizeIconvCharset(charset) {
    return charset in charset_aliases_iconv ? charset_aliases_iconv[charset] : charset;
}



// check tail of the utf8 binary and return the size of cut data
// if the data is invalid, return 0
function utf8_cutDataSizeOfTail(bin) {
    var len = bin.length;
    if (len < 4) return 0; // don't think about the data of less than 4byte

    // count bytes from tail to last character boundary
    var skipped = 0;
    for (var i = len; i > len - 4; i--) {
        var b = bin[i - 1];
        if ((b & 0x7f) === b) { // 0xxxxxxx (1byte character boundary)
            if (i === len) {
                return 0;
            } else {
                break; // invalid data
            }
        } else if ((b & 0xbf) === b) { //10xxxxxx (is not a character boundary)
            skipped++;
        } else if ((b & 0xdf) === b) { //110xxxxx (2byte character boundary)
            if (skipped === 0) {
                return 1;
            } else if (skipped === 1) {
                return 0;
            } else {
                break; // invalid data
            }
        } else if ((b & 0xef) === b) { //1110xxxx (3byte character boundary)
            if (skipped <= 1) {
                return 1 + skipped;
            } else if (skipped === 2) {
                return 0;
            } else {
                break; // invalid data
            }
        } else if ((b & 0xf7) === b) { //11110xxx (4byte character boundary)
            if (skipped <= 2) {
                return 1 + skipped;
            } else if (skipped === 3) {
                return 0;
            } else {
                break; // invalid data
            }
        }
    }
    // invalid data, return 0
    return 0;
}

module.exports.createStreams = createStreams;
