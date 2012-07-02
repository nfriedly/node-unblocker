# node-unblocker

A web proxy for evading corporate or government filters, similar to CGIproxy / PHProxy / Glype but 
written in node.js. All data is processed and relayed to the client on the fly without unnecessary 
buffering.

Any website that the proxy can access can now be reached by the proxy's users.

### The magic part

The script uses "pretty" urls which, besides looking pretty, allow links with relative paths 
to just work without modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) 
can be handled without modification by checking the referrer and 302 redirecting them to the proper 
location in the referring site.

Cookies are currently storred in the visitor's session on the server rather than being sent to the 
visitor's browser to avoid having a large number of (possibly conflicting) browser cookies once they
have browsed several sites through the proxy.

## Instalation on your system
Requires [node.js](http://nodejs.org/) >= 0.6 and [Redis](http://redis.io/) for session storage. 
Then download node-unblocker, cd into the directory, and run `npm install -d`. Optionally edit 
config.js then run `node server.js` to start the server. It should spawn a new instance for each CPU 
core you have.

## Installation on Heroku
This project should be runnable on a free [Heroku](http://www.heroku.com/) instance without 
modification - see http://node-unblocker.herokuapp.com/proxy for an example. You will need to run 
`heroku addons:add redistogo` and it would also be wise to run `heroku config:add SECRET=[something 
only you know]` to make the session cookies secure. You may also want to run 
`heroku addons:add piggyback_ssl` to enable secure browsing and/or 
`heroku config:add GA_ID=[your Google Analytics ID, ex: UA-12345-78]` to enable usage tracking via Google 
Analytics. 

## High-level Todo list

* Mini-url form
* Allow for removal of scripts (both <script /> tags and on*= handlers)
* Web interface for managing the blocklist

## License
This project and related problems are released under the terms of the [GNU GPL version 3](http://www.gnu.org/licenses/gpl.html)

## Contributors 
* [Nathan Friedly](http://nfriedly.com)
* [Arturo Filastò](https://github.com/hellais)
* [tfMen](https://github.com/tfMen)

## Change log

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
