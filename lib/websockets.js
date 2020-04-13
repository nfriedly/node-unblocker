'use strict';

var debug = require('debug')('unblocker:redirects');

module.exports = function(config, proxy) {


    function onUpgrade(data) {
        // handle websockets

        // todo: run req middleware
        // todo: make remote request
        // todo: handle remote upgrade event
        // todo: handle other remote responses


        data.remoteRequest.on("upgrade", function(
            remoteRequest,
            remoteResponse,
            head
        ) {
            data.clientSocket;
            data.remoteSocket = remoteResponse;
            // todo: add support for arbitrary websocket middleware
            config.onUpgrade(data);
        });
    }

    return onUpgrade;
};
