
var fs = require( 'fs' );
var atob = require( 'atob' );
var btoa = require( 'btoa' );

.load theFile.js

var bytes = btoa( thebinarydata );
var buffer = new Buffer( bytes, 'base64' );
fs.writeFileSync( 'filename.bin', buffer );

