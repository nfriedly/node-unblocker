Gatlin
======
A simple node.js script that turns a single-threaded server into a multi-threaded server with automatic restarting.

Plays nice with Express and similar servers.

[![Build Status](https://travis-ci.org/nfriedly/node-gatling.png?branch=master)](https://travis-ci.org/nfriedly/node-gatling)

Installation
------------

    npm install --save gatlin

Usage
-----

Your app should export the function that gets passed to `http.createServer` and not create the server itself.

For example, say your `app.js` looks like this:

    var http = require('http');
    http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World\n');
    }).listen(1337);
    
Change it to this:

    module.exports = function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World\n');
    });

And then run the following command:

    PORT=1337 ./node_modules/bin/gatlin app.js
    
That's it!

(The reason this is needed is that Gatlin runs each request inside a domain. This prevents errors in one request from interfering with any other requests.)

Gatling automatically loads `newrelic` if the `NEW_RELIC_LICENSE_KEY` environment variable is set.


Todo: 
-----

* Add support for just requiring the `app.js` and letting it start itself
* Add a watch mode for development
* Lots of tests
* Set up CI server
* Improve startup error detection