"use strict";
const RewritingStream = require("parse5-html-rewriting-stream");
const { EventEmitter } = require("events");
const debug = require("debug")("unblocker:html-parser");
const contentTypes = require("./content-types");

class HTMLEvent {
  constructor() {
    this.prevented = false;
  }
  preventDefault() {
    this.prevented = true;
  }
}

class TagEvent extends HTMLEvent {
  constructor() {
    super();
    this.beforeContent = [];
    this.afterContent = [];
  }
  insertBefore(html) {
    this.beforeContent.push(html);
  }
  insertAfter(html) {
    this.afterContent.push(html);
  }
}

class StartTagEvent extends TagEvent {
  constructor(startTag) {
    super();
    this.startTag = startTag;
  }
}

class EndTagEvent extends TagEvent {
  constructor(endTag) {
    super();
    this.endTag = endTag;
  }
}

class ContentEvent extends HTMLEvent {
  constructor(textNode, tag, url) {
    super();
    this.textNode = textNode;
    this.tag = tag;
    this.url = url;
  }
  get source() {
    return this.textNode.text;
  }
  set source(source) {
    this.textNode.text = source;
  }
  // todo: figure out a way to stream this instead of bunching up all of the contents
}

class JavaScriptEvent extends ContentEvent {}
// todo: grab the module attribute if it turns out to be useful

class StyleEvent extends ContentEvent {}

module.exports = function parseHtml(data) {
  if (contentTypes.html.includes(data.contentType)) {
    const html = new EventEmitter();
    data.html = html;

    let openStyleTag = null;
    let openScriptTag = null;

    const rewriter = new RewritingStream();
    rewriter.on("startTag", (startTag) => {
      const event = new StartTagEvent(startTag);
      html.emit("startTag", event);
      // todo: check attributes and emit appropriate events for style and various js attributes
      for (const snippet of event.beforeContent) {
        rewriter.emitRaw(snippet);
      }
      if (!event.prevented) {
        rewriter.emitStartTag(event.startTag);
      }
      for (const snippet of event.afterContent) {
        rewriter.emitRaw(snippet);
      }

      if (event.prevented) {
        return;
      }

      // todo: consider making this more generic

      if (startTag.tagName === "style" && !startTag.selfClosing) {
        openStyleTag = startTag;
      } else if (
        startTag.tagName === "script" &&
        !startTag.selfClosing &&
        // ignore <script type="application/ld+json"> and the like
        !startTag.attrs.some(
          (attr) =>
            attr.name === "src" ||
            (attr.name === "type" && attr.value.includes("json"))
        )
      ) {
        openScriptTag = startTag;
      }
    });

    rewriter.on("endTag", (endTag) => {
      const event = new EndTagEvent(endTag);
      html.emit("endTag", event);
      for (const snippet of event.beforeContent) {
        rewriter.emitRaw(snippet);
      }
      if (!event.prevented) {
        rewriter.emitEndTag(event.endTag);
      }
      for (const snippet of event.afterContent) {
        rewriter.emitRaw(snippet);
      }

      if (event.prevented) {
        return;
      }

      if (endTag.tagName === "style") {
        openStyleTag = null;
      }
      if (endTag.tagName === "script") {
        openScriptTag = null;
      }
    });

    rewriter.on("text", (textNode) => {
      if (openStyleTag && openScriptTag) {
        debug(
          "ut-oh, there are open style and script nodes, processing as style"
        );
      }
      // todo: make these into events to decouple them from html parsing (and url prefixing)
      if (openStyleTag) {
        const event = new StyleEvent(textNode, openStyleTag, data.url);
        html.emit("style", event);
        if (!event.prevented) {
          // emitRaw rather than emitText due to https://github.com/inikulin/parse5/issues/339
          rewriter.emitRaw(event.source);
        }

        openStyleTag = null;
      } else if (openScriptTag) {
        const event = new JavaScriptEvent(textNode, openStyleTag, data.url);
        html.emit("script", event);
        if (!event.prevented) {
          // emitRaw rather than emitText due to https://github.com/inikulin/parse5/issues/339
          rewriter.emitRaw(event.source);
        }
        openScriptTag = null;
      } else {
        rewriter.emitText(textNode);
      }
    });

    data.stream.setEncoding("utf8");
    data.stream = data.stream.pipe(rewriter);
  }
};
