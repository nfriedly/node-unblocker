import { initWebsockets } from "CLIENT_PATH/websocket.mjs";
import { initXMLHttpRequest } from "CLIENT_PATH/xhr.mjs";

console.log("begin unblocker client scripts");

const config = { prefix: "PREFIX" };

initWebsockets(config);
initXMLHttpRequest(config);
