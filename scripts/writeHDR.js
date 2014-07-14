
var fs = require( 'fs' );

function writeHDR( name, infile, outfile ) {
  fs.writeFileSync( outfile, 'var ' + name + ' = atob( "' + Buffer( fs.readFileSync( infile ) ).toString( 'base64' ) + '");\n' );

}
