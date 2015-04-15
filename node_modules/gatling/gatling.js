#!/usr/bin/env node

/**
 * Gatling: makes your node server multicore and automatically restarts failed processes
 */
 
 
// monitoring
// load newrelic for monitoring, but only if there's a license key
// This must be the first dependency loaded to work correctly.
if (process.env.NEW_RELIC_LICENSE_KEY) {
    require('newrelic');
}

var cluster = require('cluster'),
    argv = require('optimist')
        .usage('Usage: $0 <your app.js>')
        .alias('p', 'port')
        .describe('p', 'Port number')
        .alias('q', 'quiet')
        .describe('q', 'Silence all non-error output')
        .describe('threads', 'how manu threads to run (default is one per cpu)')
        .demand('_')
        .argv,
    log = argv.q ? function() {} : console.log.bind(console);

// master vars and methods
var numThreads = argv.threads || require('os').cpus().length,
    childCount = 0,
    startTime = Date.now();

function createWorker() {
    if (Date.now() - startTime < 300 && childCount > numThreads) {
        console.error("\nToo many instant deaths, shutting down.\n");
        process.exit(1);
    }

    var worker = cluster.fork();
    childCount++;

    worker.on('message', function(message) {
        // if there's no type, then we don't care about it here
        if (!message.type) {
            return;
        }

        // for automated tests
        if (message.type == 'ready' && process.send) {
            return process.send(message);
        }
    });
}

// worker vars and methods
var http = require('http'),
    domain = require('domain'),
    util = require('util'),
    path = require('path'),
    port = process.env.PORT || argv.port || 8080,
    appFile = path.normalize(path.join(process.cwd(), argv._[0])),
    app = require(appFile),
    server;


function handleRequest(request, response) {
    var d = domain.create();
    d.add(request);
    d.add(response);
    d.on('error', function(er) {
        console.error('error', er.stack);

        // Note: we're in dangerous territory!
        // By definition, something unexpected occurred,
        // which we probably didn't want.
        // Anything can happen now!  Be very careful!

        try {
            die();
            // try to send an error to the request that triggered the problem
            response.statusCode = 500;
            response.setHeader('content-type', 'text/plain');
            response.end('Oops, there was a problem!\n');
        } catch (er2) {
            // oh well, not much we can do at this point.
            console.error('Error sending 500!', er2.stack);
        }
    });

    // now that we're set to handle errors, let the app actually process the request
    d.run(app.bind(app, request, response));
}

function die() {
    // make sure we close down within 30 seconds
    var killtimer = setTimeout(function() {
        process.exit(1);
    }, 30000);
    // But don't keep the process open just for that!
    killtimer.unref();

    // stop taking new requests.
    server.close();

    // Let the master know we're dead.  This will trigger a
    // 'disconnect' in the cluster master, and then it will fork
    // a new worker.
    cluster.worker.disconnect();
}


if (cluster.isMaster) {
    // if we're in the master process, create one worker for each cpu core
    for (var i = 0; i < numThreads; i++) {
        createWorker();
    }

    // when the worker dies create a new one 
    cluster.on('exit', function( /*deadWorker*/ ) {
        createWorker();
    });

    log(util.format('Gatling master thread setting up workers to run %s and listen on port %s', appFile, port));

} else {

    process.on('message', function(message) {
        if (!message.type) {
            return;
        }
        //todo: see if this helps with unit testing
        if (message.type == "kill") {
            die();
        }
    });

    server = http.createServer(handleRequest);
    server.listen(port, function() {
        // this is to let the integration tests know when it's safe to run
        process.send({
            type: 'ready'
        });
        log(util.format('Gatling worker thread %s up and listening', cluster.worker.id));
    });
}
