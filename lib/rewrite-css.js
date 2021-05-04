"use strict";
// todo: consider reversing filename
const { Transform } = require("stream");
//const debug = require("debug")("unblocker:rewrite-css");
const contentTypes = require("./content-types");

// todo: handle src() and @import, figure out iv var's are worth handling

const reNextTokenOfInterest = /(url|src)\s*\(\s*(?<quote>['"]?)/gi;
function rewriteChunk(chunk, state = {}) {
  if (state.remainder) {
    chunk = state.remainder + chunk;
    reNextTokenOfInterest.lastIndex = state.remainder.length;
  } else {
    reNextTokenOfInterest.lastIndex = 0;
  }

  let match = null;
  let loc = -1;
  let lastLoc = loc + 1;
  const output = [];
  while ((match = reNextTokenOfInterest.exec(chunk)) !== null) {
    loc = match.index;

    const { quote } = match.groups;

    // now that we're in a url() declaration, determine what token will mark the end of the url
    state.nextToken = quote || " ";

    // handle the case where the identifier is a property on an object
    // we need to wrap that object in maybeGetProxy, but we'll have to work backwards to find it

    // count backwards until we find the end of the chain
    // track open brackets and parens, ignore commas inside of them
    // todo: handle cases where location is in a string - in particular, css-in-js
    // todo: handle cases where location is part of bigger word like foolocationbar
    let cursor = loc;
    const replace = true;

    // todo:  handle cases where cursor should go into the previous chunk - maybe just skip them?
    // if (cursor === -1 && !state.isFirstChunk) replace = false;

    // we don't want to include the character that caused us to break
    cursor++;

    //todo: consider going back forwards to not grab unnecessary spaces

    // push everything from lastLoc up to cursor
    output.push(chunk.slice(lastLoc, cursor));

    if (replace) {
      // console.log(
      //   "replacing:\n" + chunk.substring(cursor, loc + match[0].length)
      // );

      // todo: handle whitespace before or after dot
      // todo: include dot
      // we know there is a leading dot, there may be a trailing dot (or equals) in the match
      output.push("unblocker.maybeGetProxy(");
      output.push(chunk.slice(cursor, loc));
      output.push(")");
      // console.log(
      //   "after: ..." +
      //     chunk.substr(cursor - 10, 10) +
      //     "unblocker.maybeGetProxy(" +
      //     chunk.slice(cursor, loc) +
      //     ")" +
      //     chunk.substr(loc, match[0].length + 10) +
      //     "..."
      // );
    }
    output.push(match[0]);
    loc += match[0].length;
    lastLoc = loc;
  }

  state.remainder = chunk.slice(lastLoc);
  // todo: find the last semicolon and only keep everything after that (unless it's in a string...)

  return {
    output,
    state,
  };
}

module.exports.rewriteChunk = rewriteChunk;

module.exports = function CssRewriter(config) {
  // todo: share this with the front-end code instead of duplicating it
  const reCssUrl = /(url\s*\(\s*['"]?)([^'")]+)(['"]?\s*\))/gi;
  const reTrailingWhitespace = /\s*$/;
  function fixCSS(css, context) {
    return css.replace(reCssUrl, function (match, open, url, close) {
      // todo: make this less awful
      const wsMatch = reTrailingWhitespace.exec(url);
      if (wsMatch) {
        url = url.substr(0, url.length - wsMatch[0].length);
        close = wsMatch[0] + close;
      }

      return open + context.urlWrapper.wrap(url) + close;
    });
  }

  const re_abs_url = /(["'=]|url\(\s*)(https?:)/gi; // "http:, 'http:, =http:, or url( http:, also matches https versions
  const re_rel_proto = /(["'=]|url\(\s*)(\/\/\w)/gi; // matches //site.com style urls where the protocol is auto-sensed
  const re_rel_root = /((href=|src=|action=|url\(\s*)['"]?)(\/.)/gi; // matches root-relative urls like /foo/bar.html
  // no need to match href="asdf/adf" relative links - those will work without modification

  // partial's don't cause anything to get changed, they just cause last few characters to be buffered and checked with the next batch
  const re_html_partial = /((url\(\s*)?\s\S+\s*)$/; // capture the last two "words" and any space after them handles chunks ending in things like `<a href=` and `background-image: url( ` or `url h`

  function rewriteUrls(css, url, prefix) {
    // first upgrade // links to regular http/https links because otherwise they look like root-relative (/whatever.html) links
    css = css.replace(re_rel_proto, "$1" + url.protocol + "$2");
    // next replace urls that are relative to the root of the domain (/whatever.html) because this is how proxied urls look
    css = css.replace(
      re_rel_root,
      "$1" + url.protocol + "//" + url.host + "$3"
    );
    // last replace any complete urls
    css = css.replace(re_abs_url, "$1" + prefix + "$2");

    return css;
  }

  function createStream(uri) {
    // sometimes a chunk will end in data that may need to be modified, but it is impossible to tell
    // in that case, buffer the end and prepend it to the next chunk
    let chunk_remainder;

    // todo: simplify this - make it use the fixCss method + make a simpler chunk saving regex
    return new Transform({
      decodeStrings: false,

      transform: function (chunk, encoding, next) {
        chunk = chunk.toString();
        if (chunk_remainder) {
          chunk = chunk_remainder + chunk;
          chunk_remainder = undefined;
        }

        // second, check if any urls are partially present in the end of the chunk,
        // and buffer the end of the chunk if so; otherwise pass it along
        const partial_hits = chunk.match(re_html_partial);
        if (partial_hits && partial_hits[1]) {
          const snip = partial_hits[1].length;
          chunk_remainder = chunk.substr(-1 * snip);
          chunk = chunk.substr(0, chunk.length - snip);
        }

        chunk = rewriteUrls(chunk, uri, config.prefix);

        this.push(chunk);
        next();
      },

      flush: function (done) {
        // if we buffered a bit of text but we're now at the end of the data, then apparently
        // it wasn't a url - send it along
        if (chunk_remainder) {
          this.push(rewriteUrls(chunk_remainder, uri, config.prefix));
          chunk_remainder = undefined;
        }
        done();
      },
    });
  }

  function handleResponse(context) {
    if (context.html) {
      context.html.on("startTag", ({ startTag }) => {
        // todo make the html parser identify these and emit style events
        startTag.attrs.forEach((attr) => {
          if (attr.name === "style") {
            attr.value = fixCSS(attr.value, context);
          }
        });
      });
      context.html.on("style", (event) => {
        event.source = fixCSS(event.source, context);
      });
    } else if (contentTypes.css.includes(context.contentType)) {
      context.stream = context.stream.pipe(createStream(context.url));
    }
  }

  return {
    fixCSS,
    createStream,
    handleResponse,
  };
};
