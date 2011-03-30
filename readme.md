# node-unblocker

A web proxy for evading corporate or government filters, similar to CGIproxy / PHProxy / Glype but written in node.js. All data is processed and relayed to the client on the fly without unnecessary buffering.

The script uses "pretty" urls which, in addition to looking pretty, allow links with relative paths to just work without modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) can be handled without modification by checking the referrer and 302 redirecting them to the proper location in the referring site. (Although I intended to make it process these links on the fly also.)

Relies on [https://github.com/waveto/node-compress](https://github.com/waveto/node-compress) (`npm install compress`) to parse gzipped data.

Also includes a custom session library named simple-session that will be pulled out into a separate project at some point. It depends on [https://github.com/broofa/node-uuid](https://github.com/broofa/node-uuid) (`npm install node-uuid`)

## High-level Todo list

* Mini-url form
* Add some color and information to the home page
* URL and keyword blocklists
* Pull out session library
* Error trapping & logging
* Demo site

## License
This project and related problems are released under the terms of the [GNU GPL version 3](http://www.gnu.org/licenses/gpl.html)

## Change log

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
