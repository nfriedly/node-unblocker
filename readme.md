# node-unblocker

A web proxy for evading corporate or government filters, similar to CGIproxy / PHProxy / Glype but written in node.js. 
All data is processed and relayed to the client on the fly without unnecessary buffering.

The script uses "pretty" urls which, in addition to looking pretty, allow links with relative paths to just work without 
modification. (E.g. `<a href="path/to/file2.html"></a>`) 

In addition to this, links that are relative to the root (E.g. `<a href="/path/to/file2.html"></a>`) can be handled without 
modification by checking the referrer and 302 redirecting them to the proper location in the referring site. (Although I 
intended to make it process these links on the fly also.)

Also includes a custom session library named simple-session that may be pulled out into a separate project at some point. 
It depends on [https://github.com/broofa/node-uuid](https://github.com/broofa/node-uuid) (`npm install node-uuid`)

This project should be runnable on heroku without modification - see http://node-unblocker.herokuapp.com/proxy for an example.

## High-level Todo list

* Mini-url form
* Pull out session library
* Error trapping & logging
* Fix encoding issues
* Allow for removal of scripts (both <script /> tags and on*= handlers)

## License
This project and related problems are released under the terms of the [GNU GPL version 3](http://www.gnu.org/licenses/gpl.html)

## Change log

### v0.5.0 - 2012-2-24
* Reworked fileserver to serve index.html from memory and use compression when avaliable
* Added some windows support (although it doesn't bind to localhost

### v0.4.1 - 2012-2-23
* Fixed issue #2 for relative path bug when the domain name didn't have a / following it
* Removed compress library dependency in favor of the native zlib library that shipped in node 0.6

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
