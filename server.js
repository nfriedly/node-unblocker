var cluster = require('cluster'),
    numCPUs = require('os')
        .cpus()
        .length;

// the master will track a few statics and keep the workers up and running
cluster.setupMaster({
    exec: './proxy_worker.js'
});

var child_count = 0,
    startTime = Date.now(),
    total_requests = 0,
    total_open_requests = 0,
    max_open_requests = 0;

var MINUTE = 60,
    HOUR = 60 * 60,
    DAY = HOUR * 24;

function prettyTime(time) {
    var diff = (Date.now() - time) / 1000;
    if (diff > DAY) {
        return Math.floor(diff / DAY) + " days";
    } else if (diff > HOUR) {
        return Math.floor(diff / HOUR) + " hours";
    } else if (diff > MINUTE) {
        return Math.floor(diff / MINUTE) + " minutes";
    } else {
        return Math.round(diff * 10) / 10 + " seconds";
    }
}

function workersExcept(pid) {
    return workers.filter(function(w) {
        return w.pid != pid;
    });
}

var workers = [];

function createWorker() {
    if (Date.now() - startTime < 300 && child_count > 4) {
        console.error("\nToo many instant deaths, shutting down.\n");
        process.exit(1);
    }

    var worker = cluster.fork();
    child_count++;
    workers.push(worker);

    worker.open_requests = 0;
    worker.start_time = Date.now();

    worker.on('message', function(message) {
        // if there's no type, then we don't care about it here
        if (!message.type) {
            return;
        }

        // for automated tests
        if (message.type == 'ready' && process.send) {
            return process.send(message);
        }

        //console.log('message recieved by master ', message);

        // if it's a status request sent to everyone, respond with the master's status before passing it along
        if (message.type == "status.request") {
            var data = {
                type: "status.response",
                "Master PID": process.pid,
                "Online Since": startTime.toString() + "(about " + prettyTime(startTime) + ")",
                "Workers Started": child_count,
                "Total Requests Served": total_requests,
                "Current Open Requests": total_open_requests,
                "Max Open Requests": max_open_requests
            };

            var uptime = ((new Date)
                .getTime() - startTime.getTime()) / 1000;
            if (total_requests > uptime) {
                data["Requests Per Second (average)"] = total_requests / uptime;
            } else if (total_requests > uptime / MINUTE) {
                data["Requests Per Minute (average)"] = total_requests / (uptime / MINUTE);
            } else if (total_requests > uptime / HOUR) {
                data["Requests Per Hour (average)"] = total_requests / (uptime / HOUR);
            } else {
                data["Requests Per Day (average)"] = total_requests / (uptime / DAY);
            }

            data.Workers = "";
            workers.forEach(function(w) {
                data.Workers += "\n - " + w.pid + " online for " + prettyTime(w.start_time);
            });

            worker.send(data);
        }

        if (message.type == "request.start") {
            worker.open_requests++;
            total_open_requests++;
            if (max_open_requests < total_open_requests) {
                max_open_requests = total_open_requests;
            }
            total_requests++;
        }

        if (message.type == "request.end") {
            worker.open_requests--;
            total_open_requests--;
        }
    });
}

// if we're in the master process, create one worker for each cpu core
for (var i = 0; i < numCPUs; i++) {
    createWorker();
}

var recentDeaths = 0;

// when the worker dies, note the exit code, remove it from the workers array, and create a new one 
cluster.on('exit', function(worker) {
    total_open_requests = total_open_requests - worker.open_requests;
    workers = workersExcept(worker.pid)
    createWorker();
});
