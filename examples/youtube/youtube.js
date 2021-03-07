"use strict";

const ytdl = require("ytdl-core");

// handles youtube video pages and replaces them with a custom page that just streams the video
function processRequest(data) {
  const { hostname, pathname } = new URL(data.url);
  if (hostname === "www.youtube.com" && pathname === "/watch") {
    const res = data.clientResponse;
    // if we write headers, unblocker will detect that and stop trying to process this request
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });

    // todo: use config.prefix instead of hard-coding '/proxy/' into the url
    ytdl
      .getInfo(data.url)
      .then((info) => {
        // only use formats with combined audio and video (note these tend to be lower resolution)
        const formats = ytdl.filterFormats(info.formats, "audioandvideo");

        const thumb = info.videoDetails.thumbnails.pop();

        res.end(
          `<!DOCTYPE html>
<head>
<title>${info.videoDetails.title}</title>
<meta name="ROBOTS" content="NOINDEX, NOFOLLOW"/>
</head>
<body>
<h1>${info.videoDetails.title}</h1>
<video controls poster="${thumb.url}" style="width: 100%">
${formats
  .map(
    (format) =>
      `  <source type="${format.mimeType
        .split(";")
        .shift()}" src="/proxy/${format.url.replace(/&/g, "&amp;")}">`
  )
  .join("\n")}
</video>
<p>${info.videoDetails.description.replace(/[\n]/g, "\n<br>")}</p>
</body>
</html>
`
        );
      })
      .catch((err) => {
        console.error(`Error getting info for ${data.url}`, err);
        res.end("Error retrieving video info");
      });
  }
}

module.exports = {
  processRequest,
};
