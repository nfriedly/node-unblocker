"use strict";
// todo: consider reversing filename
const { Transform } = require("stream");
const debug = require("debug")("unblocker:rewrite-css");
const contentTypes = require("./content-types");

// looks for url() or src() or @import statements
const reNextTokenOfInterest = /(?<url>url)\s*\(\s*(?<urlQuote>['"]?)|(?<src>src)\s*\(\s*(?<srcQuote>['"])|(?<atImport>@import)\s+(?<importUrl>url\s*\(\s*)?(?<importQuote>['"])?/gi;

// (?<!\\) is a negative lookbehind assertion to ensure we don't match an escaped character, such as \'
// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Assertions
const reSingleQuote = /(?<!\\)'/g;
const reDoubleQuote = /(?<!\\)"/g;
const reClosingParen = /\s*(?<!\\)\)/g; // end of `url(style.css)` or `url( style.css )`
const reSemiColon = /\s*(?<!\\);/g;

const reEscaped = /\\./g;
function unescapeMatch(match) {
  return "%" + match.charCodeAt(1).toString(16);
}

function getReForQuote(quote) {
  if (quote === "'") return reSingleQuote;
  if (quote === '"') return reDoubleQuote;
  throw new Error(`Unrecognized quotemark: ${quote} (${typeof quote})`);
}

function rewriteChunk(chunk, context, state = {}) {
  if (state.remainder) {
    chunk = state.remainder + chunk;
  }
  reNextTokenOfInterest.lastIndex = 0;

  let match = null;
  let loc = 0;
  let reMatchEnd = null;
  const output = [];

  //debug("rewriting chunk from index %s\n%s", reNextTokenOfInterest.lastIndex, chunk)

  // this should mark the beginning of a url
  while ((match = reNextTokenOfInterest.exec(chunk)) !== null) {
    debug("match found at index %s: %j %j", match.index, match, match.groups);

    // now we know where the url starts
    const startLoc = match.index + match[0].length;

    const {
      url,
      urlQuote,
      src,
      srcQuote,
      atImport,
      importUrl,
      importQuote,
    } = match.groups;

    // push all data up to the start of the match
    output.push(chunk.slice(loc, match.index));
    loc = match.index;

    // figure out what should mark the end of the url
    if (urlQuote || srcQuote || importQuote) {
      reMatchEnd = getReForQuote(urlQuote || srcQuote || importQuote);
    } else if (url || src || importUrl) {
      reMatchEnd = reClosingParen;
    } else if (atImport) {
      reMatchEnd = reSemiColon;
    }

    // find it
    reMatchEnd.lastIndex = startLoc;
    // todo: watch for escaped characters
    const matchEnd = reMatchEnd.exec(chunk);

    // if we've reached the end of the chunk without finding a match, try again with the next chunk
    if (!matchEnd) {
      break;
    }

    // now we know where the url starts and ends
    const endLoc = matchEnd.index;

    // push the initial match (we didn't push it earlier just in case we couldn't find the end)
    output.push(match[0]);

    // wrap and push the url
    const unwrapped = chunk
      .slice(startLoc, endLoc)
      .replace(reEscaped, unescapeMatch);
    const wrapped = context.urlWrapper.wrap(unwrapped);
    debug("rewrote %s to %s", unwrapped, wrapped);
    output.push(wrapped);

    // mark where to start the next iteration
    loc = endLoc;
  }

  state.remainder = chunk.slice(loc);

  return {
    output,
    state,
  };
}

function rewriteCssSync(css, context) {
  const { output, state } = rewriteChunk(css, context);
  if (state.curString) {
    console.warn("Incomplete url found in css", state);
  }
  return output.join("") + (state.remainder || "");
}

class RewriteCssStream extends Transform {
  constructor(context, opts = {}) {
    opts.decodeStrings = false;
    opts.encoding = "utf8";
    super(opts);
    this.context = context;
    this.state = { remainder: "", url: opts.url || "" }; // todo: get url
  }

  _transform(chunk, encoding, next) {
    const { output } = rewriteChunk(chunk, this.context, this.state);
    for (const substr of output) {
      this.push(substr);
    }
    next();
  }

  _flush() {
    if (this.state.remainder) {
      this.push(this.state.remainder);
    }
    this.push(null);
  }
}

function handleResponse(context) {
  if (context.html) {
    context.html.on("startTag", ({ startTag }) => {
      // todo make the html parser identify these and emit style events
      startTag.attrs.forEach((attr) => {
        if (attr.name === "style") {
          attr.value = rewriteCssSync(attr.value, context);
        }
      });
    });
    context.html.on("style", (event) => {
      event.source = rewriteCssSync(event.source, context);
    });
  } else if (contentTypes.css.includes(context.contentType)) {
    context.stream = context.stream.pipe(new RewriteCssStream(context));
  }
}

module.exports = {
  rewriteCssSync, // exported for testing
  RewriteCssStream, // exported for testing
  handleResponse,
};
