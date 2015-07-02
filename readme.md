# unblocker

Unblocker was originally a web proxy for evading internet censorship, similar to CGIproxy / PHProxy / Glype but 
written in node.js. It's since morphed into a general-purpose library for proxying and rewriting remote webpages.
 
All data is processed and relayed to the client on the fly without unnecessary buffering, making unblocker one of the 
fastest web proxies available.

[![Build Status](https://travis-ci.org/nfriedly/node-unblocker.png?branch=master)](https://travis-ci.org/nfriedly/node-unblocker)

### The magic part

The script uses "pretty" urls which, besides looking pretty, allow links with relative paths 
to just work without modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) 
can be handled without modification by checking the referrer and 307 redirecting them to the proper 
location in the referring site. (Although the proxy does attempt to rewrite these links to avoid the redirect.)

Cookies are proxied by adjusting their path to include the proxy's URL, and a bit of extra work is done to ensure they 
remain intact when switching protocols or subdomains.

## Running the website on your computer

Requires [node.js](http://nodejs.org/) >= 0.12.
Then [download node-unblocker](https://github.com/nfriedly/node-unblocker/archive/master.zip), 
`cd` into the `examples/nodeunblocker.com/` directory, 
and run `npm install` to set things up. 
Then run `npm start` to start the server. It should spawn a new instance for each CPU 
core you have. 

(Note: running `node app.js` *will not work*. The server code is in the [Gatling](https://npmjs.org/package/gatling) 
package, which the `npm start` command calls automatically.)

## Running the website on heroku/bluemix/modulous/etc

This project should be runnable on a free [Heroku](http://www.heroku.com/) instance without 
modification - just copy the `examples/nodeunblocker.com/` folder to a new git repo and push it.

## Using unblocker as a library in your software

See `examples/nodeunblocker.com/app.js` for an example of adding a bit of middleware, see `lib/unblocker.js` for all configuration options.

## Todo

* Consider adding compress middleware to compress text-like responses
* Fully document API
* Even more tests

## License
This project is released under the terms of the [GNU AGPL version 3](https://www.gnu.org/licenses/agpl-3.0.html).
 
Commercial licensing and support are also available, contact Nathan Friedly (nathan@nfriedly.com) for details.

## Contributors 
* [Nathan Friedly](http://nfriedly.com)
* [Arturo Filastò](https://github.com/hellais)
* [tfMen](https://github.com/tfMen)
* [Emil Hemdal](https://github.com/emilhem)

## Change log

### v1.0.0 - 2015-07-03
* Refactored unblocker into an express-compatible library with nodeunblocker.com code moved to examples folder
* Added a middleware API and updated most internal logic to use the API
* Added support for hosting the proxy at / rather than just at /proxy/
* Rewrote cookie handling to no longer require a redis server

### v0.14.0 - 2015-06-29
* Added charset encoding tests
* Switched from iconv to iconv-lite: faster and no compiliation needed (this is especially helpful for running on Windows)
* Bumped node.js requirement to 0.12
* Added [dotenv](https://www.npmjs.com/package/dotenv) for local development

### v0.13.1 - 2014-6-25
* remove strict-transport-security header
* tweaks to play nice on nodejitsu servers

### v0.12.0 - 2013-12-12
* Replaced server.js with [Gatling](https://github.com/nfriedly/node-gatling)
* Removed memwatch

### v0.11.3 - 2013-12-4
* Updated design to be mobile-friendly

### v0.11.1 - 2013-12-4
* Tweaked Redis client and blocklist to not keep server open after unit tests

### v0.11.0 - 2013-12-3
* Seperated app and server more cleanly
* Additional JSHint checks
* Added [memwatch](https://github.com/lloyd/node-memwatch)

### v0.10.1
* Replaced built-in monitoring code with (optional) New Relic support
* Split proxying and server code into two files.

### v0.9.4 - 2013-12-2
* Fixed a bug when attempting to parse cookies on invalid urls

### v0.9.3 - 2013-12-2
* Added JSHint to the test suite
* JSBeautify'd code
* Moved static content and code to it's own directory and file
* Added a test for static content

### v0.9.2 - 2013-11-31
* Added unit tests for url prefixing on streams that get split in various locations
* Fixed bugs these tests revealed
* Fixed bug with links pointing to / not getting rewritten
* Added backpressure support to streams

### v0.9.1 - 2013-11-31
* Unit tests for Google Analytics
* Google Analytics bug fix

### v0.9.0 - 2013-11-31
* Set up Continous Deployment
* Default proxied traffic to SSL if url is nodeunblocker.com
* Updated to Node.js v0.10-style streams
* Split encoding, url prefixing, ROBOTS meta tag, and Google Analytics into individual files (and streams)
* Unit tests for UrlPrefixStream.
* Added a performance test
* Increased the HTTP Agent's maximum number of Open Connections - issue https://github.com/nfriedly/node-unblocker/issues/17

### v0.8.2 - 2013-11-26
* Added tests
* Fixed a few bugs with creating proxied links.

### v0.8.0 - 2012-4-29
* Added support for more charsets via Iconv. (Issues #10 & #11)
** This may have broken compatibility with Windows, more investigation to come. https://github.com/nfriedly/node-unblocker/zipball/v0.7.1 is pure JS and known to be Windows-compatible.

### v0.7.1 - 2012-3-6
* Added GA tracking and and noindex/nofollow meta tags to proxied pages
* Improved status page to show cluster-wide statistics (Issue #4)
* Fixed issue #7 to better track concurrent requests

### v0.6.0 - 2012-2-24
* Added support for node.js 0.6's native clustering
* Removed simple-session library and replaced it with [connect's](https://github.com/senchalabs/connect/) session library backed by a redis store

### v0.5.0 - 2012-2-24
* Reworked fileserver to serve index.html from memory and use compression when avaliable
* Added some windows support (although it doesn't bind to localhost)

### v0.4.1 - 2012-2-23
* Fixed issue #2 for relative path bug when the domain name didn't have a / following it
* Removed compress library dependency in favor of the native zlib library that shipped in node 0.6
* Several small tweaks to support running on Heroku servers

### v0.4 - 2011-4-4
* Added keyword and domain blocklists
* Pulled out configuration into a separate file
* Set up live demo at nodeunblocker.com
* Added "military" theme

### v0.3 - 2011-03-29
* Added support for remote HTTPS servers.
* Created a simple-session library. (The ones I tried were all tied to bigger projects and/or didn't work well)
* Added basic cookie support via sessions.
* Urls that are relative to the root of the site are now processed in both html and css.
* Now only buffers last few characters if a chunk appears to end in the middle of a url.
	
### v0.2 - 2011-03-28
* Added redirect support 
* Added gzip support
* improved filters

### v0.1 - 2011-03-26
* Initial release; basic passthrough and url-fixing functionality
