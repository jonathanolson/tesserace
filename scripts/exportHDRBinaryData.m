
function exportHDRBinaryData( infile, outfile, width, height )

img = hdrimread( infile ); % read in the HDR image (whatever format Matlab supports)
resizedImg = imresize( img, [height,width] ); % resize the image as needed
permutedImg = permute( resizedImg, [3,2,1] ); % swap the data order that Matlab will execute it in, so it is in the texture-required order

% write the image out in little-endian packed single-precision floats
fid = fopen( outfile, 'w' );
fwrite( fid, permutedImg, 'float32', 0, 'ieee-le' );
fclose( fid );

