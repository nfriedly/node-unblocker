# node-unblocker

A web proxy for evading corporate or government filters, similar to CGIproxy / PHProxy / Glype but 
written in node.js. All data is processed and relayed to the client on the fly without unnecessary 
buffering.

Any website that the proxy can access can now be reached by the proxy's users.

[![Build Status](https://travis-ci.org/nfriedly/node-unblocker.png?branch=master)](https://travis-ci.org/nfriedly/node-unblocker)

### The magic part

The script uses "pretty" urls which, besides looking pretty, allow links with relative paths 
to just work without modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) 
can be handled without modification by checking the referrer and 307 redirecting them to the proper 
location in the referring site. (Although the proxy does attempt to rewrite these links to avoid the redirect.)

Cookies are currently storred in the visitor's session on the server rather than being sent to the 
visitor's browser to avoid having a large number of (possibly conflicting) browser cookies once they
have browsed several sites through the proxy.

## Installation on your system

Requires [node.js](http://nodejs.org/) >= 0.8 (0.10 is recommended) and [Redis](http://redis.io/) for session storage. 
Then [download node-unblocker](https://github.com/nfriedly/node-unblocker/archive/master.zip), `cd` into the directory, 
and run `npm rebuild`. Optionally edit 
config.js then run `npm start` to start the server. It should spawn a new instance for each CPU 
core you have. 

(Note: running `node app.js` *will not work*. The server code is in the [Gatling](https://npmjs.org/package/gatling) package, which the `npm start` command calls automatically.)

## Installation on Heroku

This project should be runnable on a free [Heroku](http://www.heroku.com/) instance without 
modification - see http://node-unblocker.herokuapp.com/proxy for an example. You will want to run the 
following commands:

    heroku addons:add redistogo
    heroku config:add SECRET=<TYPE SOMETHING SECRET AND/OR RANDOM HERE>
    
This sets up a free redis cache instance and secures your cookies.

Optionally, you may want to run one or both of the following lines:

    # newrelic monitoring so that you can be alerted when there's an issue
    heroku addons:add newrelic:stark
    
    # google analytics so that you can see how much usage your proxy is getting
    heroku config:add GA_ID=[your Google Analytics ID, ex: UA-12345-78]

## Todo

* Write more tests: character encoding, compression, end-to-end tests in real browsers
* Consider gzipping all appropriate responses (anything text-like and more than a few kb)
* Break things into sub-modules and make the core easier to embed and extend

## Maybe Todo list

* Mini-url form
* Allow for removal of scripts (both script tags and on*= handlers)

## License
This project is released under the terms of the [GNU GPL version 3](http://www.gnu.org/licenses/gpl.html)

## Contributors 
* [Nathan Friedly](http://nfriedly.com)
* [Arturo Filastò](https://github.com/hellais)
* [tfMen](https://github.com/tfMen)
* [Emil Hemdal](https://github.com/emilhem)

## Change log

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
