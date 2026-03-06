// Patch http.ServerResponse to strip X-Frame-Options,
// allowing Theia to be embedded in an iframe.
const http = require("http");
const origWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  this.removeHeader("x-frame-options");
  return origWriteHead.apply(this, args);
};

// Boot Theia
require("./lib/backend/main.js");
