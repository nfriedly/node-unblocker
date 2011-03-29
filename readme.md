# node-unblocker

A web proxy for evading corporate or government filters, similar to CGIproxy or PHProxy but written in node.js

All data is processed and relayed to the client on the fly without unnecessary buffering.

The script uses "pretty" urls which, in addition to looking pretty, allow links with relative paths to just work without modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) can be handled without modification by checking the referrer and 302 redirecting them to the proper location in the referring site. (Although I intended to make it process these links on the fly also.)

Relies on [https://github.com/waveto/node-compress](https://github.com/waveto/node-compress) (`npm install compress`) to parse gzipped data.

## High-level Todo list

* Cookies will need to be stored and processed on the server-side
* HTTPS support
* Process urls that are relative to the site root in both html and css
* Mini-url form
* Add some color and information to the home page
* URL and keyword blocklists

## License
This project and related problems are released under the terms of the [GNU GPL version 3](http://www.gnu.org/licenses/gpl.html)

## Changelog

v0.1 - Initial release; basic passthrough and url-fixing functionality
v0.2 - Added redirect support and gzip support, improved filters
