var cluster = require('cluster'),
    numCPUs = require('os').cpus().length;

// the master will track a few statics and keep the workers up and running
cluster.setupMaster({
    exec: './proxy_worker.js'
});

var childCount = 0,
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

// if we're in the master process, create one worker for each cpu core
for (var i = 0; i < numCPUs; i++) {
    createWorker();
}

// when the worker dies create a new one 
cluster.on('exit', function(deadWorker) {
    createWorker();
});
