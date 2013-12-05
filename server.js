require('./monitor');

var cluster = require('cluster');

// master vars and methods
var numCPUs = require('os').cpus().length,
    childCount = 0,
    startTime = Date.now();

function createWorker() {
    if (Date.now() - startTime < 300 && childCount > 4) {
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
    app = require('./app').getApp(true), // true = connect to redis
    config = require('./config'),
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
    for (var i = 0; i < numCPUs; i++) {
        createWorker();
    }

    // when the worker dies create a new one 
    cluster.on('exit', function( /*deadWorker*/ ) {
        createWorker();
    });

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
    server.listen(config.port, config.ip, function() {
        // this is to let the integration tests know when it's safe to run
        process.send({
            type: 'ready'
        });
        console.log('node-unblocker proxy server with pid ' + process.pid + ' running on ' +
            ((config.ip) ? config.ip + ":" : "port ") + config.port
        );
    });
}
