"use strict";
const { Transform } = require("stream");

// this can incorrectly capture variables with emoji + "location" in the name. Meh.
const reNextTokenOfInterest = /(?<quote>['"`])|(?<leadingWhiteSpace>\s*)(?<leadingDot>\.\s*)?(?<![\w$])(?<identifier>location|baseURI|cookie)(?![\w$])\s*((?<trailingDot>\.)|(?<trailingEquals>=)|(?<trailingColon>:))?/g;

//const text = 'window_location.path = foo;';
// const result = text.match(reNextTokenOfInterest);
// console.log(result, reNextTokenOfInterest.lastIndex);
// result && Object.keys(result.groups).forEach(key => console.log(key, result.groups[key]));

/**
 * Rewrites a single chunk synchronously
 * @param chunk string
 * @param state {curString: [string], url: URL}
 * @returns {output: [string], state}
 */
function rewriteChunk(chunk, state = {}) {
  // todo: check first chunk for "for (;;);"

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

    const {
      quote,
      leadingWhiteSpace,
      leadingDot,
      identifier,
      trailingDot,
      trailingEquals,
      trailingColon,
    } = match.groups;

    // track when we're in a string
    if (quote) {
      if (!state.curString) {
        // we weren't in a string, but we are now
        state.curString = quote;
      }
      if (state.curString === quote) {
        // we were in a string, and now we're out
        state.curString = null;
      }

      // look for the next token of interest (or the end of the current string)
      continue;
    }

    // ignore everything else when we're in a string
    // todo: handle js in template strings, e.g. var foo = `the url is ${location.href}`;
    //        - need to make a stack of strings and ${} to handle this
    if (state.curString) {
      continue;
    }

    if (trailingColon) {
      // this indicates the current identifier is a property in a JSON object
      // e.g. var foo = { location: 'bar' };
      continue;
    }

    // console.log(
    //   "found",
    //   identifier,
    //   "at index",
    //   loc,
    //   "in ",
    //   state.url.toString()
    // );
    // console.log(
    //   "..." +
    //     chunk.substr(Math.max(0, loc - 10), identifier.length + 10) +
    //     "..."
    // );

    if (!leadingDot) {
      // the identifier is not a property on another object
      if (identifier !== "location") {
        // the others aren't globals, so we don't want to rewrite them
        // todo: should I push everything up to loc and reset lastLoc? (probably not)
        continue;
      }

      // handle simple cases like var path = location.pathname; or location.search = "?foo"
      if (trailingDot) {
        output.push(chunk.slice(lastLoc, loc));
        output.push(leadingWhiteSpace);
        output.push("unblocker.maybeGetProxy(location).");
        loc += match[0].length;
        lastLoc = loc;
        continue;
      }

      // identifier sets, e.g. location = 'http://example.com/'
      // todo: handle cases where there is a local var named "location"
      if (trailingEquals) {
        output.push(chunk.slice(lastLoc, loc));
        output.push("unblocker.window.");
        output.push(match[0]);
        loc += match[0].length;
        lastLoc = loc;
        continue;
      }
    }

    // handle the case where the identifier is a property on an object
    // we need to wrap that object in maybeGetProxy, but we'll have to work backwards to find it

    // count backwards until we find the end of the chain
    // track open brackets and parens, ignore commas inside of them
    // todo: handle cases where location is in a string - in particular, css-in-js
    // todo: handle cases where location is part of bigger word like foolocationbar
    let cursor = loc;
    let expectingObject = true;
    const openBrackets = [];
    let replace = true;
    reverseIteration: while (--cursor >= lastLoc) {
      const char = chunk[cursor];
      let isWhitespace = false;
      switch (char) {
        case ";":
          break reverseIteration;
        case ",":
        case "+":
        case "-":
        case "/":
        case "%":
        case "=":
        case "!":
        case "?":
        case ":":
        case "|":
        case "&":
          if (!openBrackets.length) break reverseIteration;
          break;
        case " ": // note: the regex captures any whitespace before and after the dot
        case "\n":
        case "\r":
        case "\t":
          if (!openBrackets.length) {
            break reverseIteration;
          } else {
            isWhitespace = true;
            break;
          }
        // reminder: we're going backwards,
        // so open brackets start with a closing one
        case "]":
        case ")":
          if (expectingObject) {
            openBrackets.push(char);
            break;
          } else {
            break reverseIteration;
          }
        case "}":
          if (!openBrackets.length) {
            break reverseIteration;
          } else {
            openBrackets.push(char);
            break;
          }
        case "(":
        case "[":
        case "{":
          if (openBrackets.length) {
            openBrackets.pop();
            // todo: validate that the opening and closing bracket match
            // although, what would I do if they didn't?
            break;
          } else {
            break reverseIteration;
          }
        case '"':
        case "'":
        case "`":
          // todo: track wether or not we're in a string going backwards
          // for now, just bail out
          replace = false;
          break reverseIteration;
        // toto: would a simpler continue; work here?
        default:
          // continue backwards
          break;
      }
      if (!isWhitespace) {
        expectingObject = char === ".";
      }
    }
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

function rewriteJsSync(js, url = "") {
  const { output, state } = rewriteChunk(js, { url });
  if (state.curString) {
    console.warn("Unclosed quote found in js", state);
  }
  return output.join("") + (state.remainder || "");
}

class RewriteJsStream extends Transform {
  constructor(opts = {}) {
    opts.decodeStrings = false;
    opts.encoding = "utf8";
    super(opts);
    this.state = { remainder: "", url: opts.url || "" }; // todo: get url
  }

  _transform(chunk, encoding, next) {
    const { output } = rewriteChunk(chunk, this.state);
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

module.exports = {
  rewriteJsSync,
  RewriteJsStream,
};
