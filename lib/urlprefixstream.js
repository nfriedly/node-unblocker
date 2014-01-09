var through = require('through'),
    _ = require('underscore');

var defaultConfig = {
    prefix: '',
    uri: {}
};

function setDefaults(config) {
    defaultConfig = _.defaults(config, defaultConfig);
}

var re_abs_url = /("|'|=)(http:(\/\/|\\\/\\\/)|https:(\/\/|\\\/\\\/))/ig, // "http, 'http, or =http
    re_rel_proto = /("|'|=)(\/\/\w)/ig, // matches //site.com style urls where the protocol is auto-sensed
    re_rel_root = /((href|src|action)=['"]{0,1})(\/.)/ig, // matches src="/asdf/asdf"
    // no need to match href="asdf/adf" relative links - those will work without modification

    // note: we con't check for urls in quotes here because the previous check will have already handled them
    re_css_abs = /(url\(\s*)(https?:(\/\/|\\\/\\\/))/ig, // matches url( http
    re_css_rel_proto = /(url\(\s*)(\/\/\w)/ig,
    re_css_rel_root = /(url\(\s*['"]{0,1})(\/\w)/ig, // matches url( /asdf/img.jpg

    // partial's dont cause anything to get changed, they just cause last few characters to be buffered and checked with the next batch
    re_html_partial = /((.url\(\s*)?\s[^\s]+\s*)$/, // capture the last two "words" and any space after them  - for `url( h`
    
    // matches broken xmlns attributes like xmlns="/proxy/http://www.w3.org/1999/xhtml" and xmlns:og="/proxy/http://ogp.me/ns#"
    re_proxied_xmlns = /(xmlns(:[a-z]+)?=")\/proxy\//ig;


function rewriteUrls(chunk, uri, thisSite) {
    // some special rules for CSS
    chunk = chunk.replace(re_css_rel_proto, "$1" + uri.protocol + "$2");
    chunk = chunk.replace(re_css_rel_root, "$1" + uri.protocol + "//" + uri.host + "$2");
    chunk = chunk.replace(re_css_abs, "$1" + thisSite + "$2");

    // first upgrade // links to regular http/https links because otherwise they look like root-relative (/whatever.html) links
    chunk = chunk.replace(re_rel_proto, "$1" + uri.protocol + "$2");
    // next replace urls that are relative to the root of the domain (/whatever.html) because this is how proxied urls look
    chunk = chunk.replace(re_rel_root, "$1" + uri.protocol + "//" + uri.host + "$3");
    // last replace any complete urls
    chunk = chunk.replace(re_abs_url, "$1" + thisSite + "$2");

    // fix xmlns attributes that were broken because they contained urls.
    // (JS RegExp doesn't support negative lookbehind, so breaking and then fixing is simpler than trying to not break in the first place)
    chunk = chunk.replace(re_proxied_xmlns, "$1");

    return chunk;
}

function createStream(config) {
    _.defaults(config, defaultConfig);

    // sometimes a chunk will end in data that may need to be modified, but it is impossible to tell
    // in that case, buffer the end and prepend it to the next chunk
    var chunk_remainder;

    function write(chunk) {
        chunk = chunk.toString();
        if (chunk_remainder) {
            chunk = chunk_remainder + chunk;
            chunk_remainder = undefined;
        }

        // second, check if any urls are partially present in the end of the chunk,
        // and buffer the end of the chunk if so; otherwise pass it along
        var partial_hits = chunk.match(re_html_partial);
        if (partial_hits && partial_hits[1]) {
            var snip = partial_hits[1].length;
            chunk_remainder = chunk.substr(-1 * snip);
            chunk = chunk.substr(0, chunk.length - snip);
        }

        chunk = rewriteUrls(chunk, config.uri, config.prefix);


        this.queue(chunk);
    }

    function end() {
        // if we buffered a bit of text but we're now at the end of the data, then apparently
        // it wasn't a url - send it along
        if (chunk_remainder) {
            this.queue(chunk_remainder);
            chunk_remainder = undefined;
        }
        this.queue(null);
    }

    return through(write, end);
}

module.exports.rewriteUrls = rewriteUrls;
module.exports.createStream = createStream;
module.exports.setDefaults = setDefaults;
