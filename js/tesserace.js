/*
 * Main utilities and code
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

// namespace
var tess = window.tess || {};

(function(){

  // so we don't use Float64Array in transfer
  dot.FastArray = window.Float32Array;

  tess.airIOR = 1.0002771;

  tess.epsilon = '0.0001';
  tess.smallEpsilon = '0.0000001';

  var canvas = document.getElementById( 'canvas' );
  var gl;
  window.failureMessage = 'Could not load WebGL Context';
  try {
    var preserve = false;
    gl = tess.gl = canvas.getContext( 'webgl', { preserveDrawingBuffer: preserve } ) || canvas.getContext( 'experimental-webgl', { preserveDrawingBuffer: preserve } );
    if ( gl.getExtension( 'OES_texture_float' ) === null ) {
      failureMessage = 'Required WebGL OES_texture_float extension could not be loaded';
      gl = null;
    }
    if ( gl.getExtension( 'OES_texture_float_linear' ) === null ) {
      failureMessage = 'Required WebGL OES_texture_float_linear extension could not be loaded';
      gl = null;
    }
  } catch ( e ) {
    // TODO: handle gracefully
    // throw e;
  }
  if ( !gl ) {
    console.log( failureMessage );
    throw new Error( 'Unable to load WebGL' );
  }

  // polyfill requestAnimationFrame
  (function () {
    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];
    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x ) {
      window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
      window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if ( !window.requestAnimationFrame ) {
      window.requestAnimationFrame = function(callback) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function() { callback(currTime + timeToCall); },
          timeToCall);
        lastTime = currTime + timeToCall;
        return id;
      };
    }

    if ( !window.cancelAnimationFrame ) {
      window.cancelAnimationFrame = function(id) {
        clearTimeout(id);
      };
    }
  })();

  tess.toFloat = function( n ) {
    var s = n.toString();
    return ( s.indexOf( '.' ) < 0 && s.indexOf( 'e' ) < 0 && s.indexOf( 'E' ) < 0 ) ? ( s + '.0' ) : s;
  };

  tess.toVec3 = function( vector3 ) {
    return 'vec3(' + vector3.x + ',' + vector3.y + ','+ vector3.z + ')';
  };

  tess.toVec2 = function( vector2 ) {
    return 'vec2(' + vector2.x + ',' + vector2.y + ')';
  };

  tess.toVec4 = function( vector4 ) {
    return 'vec3(' + vector4.x + ',' + vector4.y + ','+ vector4.z + ',' + vector4.w + ')';
  };

  tess.createShader = function( source, type ) {
    var shader = gl.createShader( type );
    gl.shaderSource( shader, source );
    gl.compileShader( shader );

    if( !gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {
      console.log( gl.getShaderInfoLog( shader ) );
      console.log( source );
      throw new Error( 'GLSL compile error: ' + gl.getShaderInfoLog( shader ) );
    }

    return shader;
  };

  // Our rawData is in the order exported by Matlab's HDR data being written to file.
  tess.createHDRTexture = function( gl, rawData, width, height, scale, flip, format ) {
    scale = scale || 1;

    var data = new Float32Array( width * height * 3 );
    for ( var row = 0; row < height; row++ ) {
      for ( var col = 0; col < width; col++ ) {
        var offset = 3 * (row * width + col);
        data[offset + 0] = scale * rawData[3 * row * width + col];
        data[offset + 1] = scale * rawData[3 * row * width + col + width];
        data[offset + 2] = scale * rawData[3 * row * width + col + width * 2];
      }
    }

    return tess.createRawHDRTexture( gl, data, width, height, flip, format );
  };

  // bytes from atob from base64'd float32 in the proper order
  tess.createBytesHDRTexture = function( gl, bytes, width, height, flip, format ) {
    var byteNums = new Array( bytes.length );
    for ( var i = 0; i < bytes.length; i++) {
        byteNums[i] = bytes.charCodeAt( i );
    }
    var arr = new Uint8Array( byteNums );
    var data = new Float32Array( arr.buffer );

    return tess.createRawHDRTexture( gl, data, width, height, flip, format );
  };

  tess.createRawHDRTexture = function( gl, rawData, width, height, flip, format ) {
    var floatTexture = gl.createTexture();
    gl.bindTexture( gl.TEXTURE_2D, floatTexture );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, flip );
    gl.texImage2D( gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.FLOAT, rawData );
    gl.bindTexture( gl.TEXTURE_2D, null );

    return floatTexture;
  };

  tess.asyncLoadBinaryHDRTexture = function( gl, url, width, height, flip, format, callback ) {
    var req = new XMLHttpRequest();
    req.open( 'GET', url, true );
    req.responseType = 'arraybuffer';

    req.onload = function ( evt ) {
      var arrayBuffer = req.response;
      if ( arrayBuffer ) {
        var data = new Float32Array( arrayBuffer );
        var floatTexture = tess.createRawHDRTexture( gl, data, width, height, flip, format );

        callback( floatTexture );
      } else {
        // TODO: better error handling
        callback( null );
      }
    };
    req.send( null );
  };

  // HDR file format, assuming no run-length encoding, -Y +X, and nothing else funny (e.g. what Matlab produces)
  tess.asyncLoadHDRTexture = function( gl, url, width, height, flip, format, callback ) {
    var req = new XMLHttpRequest();
    req.open( 'GET', url, true );
    req.responseType = 'arraybuffer';

    req.onload = function ( evt ) {
      var arrayBuffer = req.response;
      if ( arrayBuffer ) {
        var bytes = new Uint8Array( arrayBuffer );
        var data = new Float32Array( width * height * 3 );

        var byteIndex = 0;

        // skip the main header (we already assume the format, width and height)
        for ( ; byteIndex < bytes.length; byteIndex++ ) {
          if ( bytes[byteIndex] === 0x0A && bytes[byteIndex+1] === 0x0A ) {
            byteIndex = byteIndex + 2;
            break;
          }
        }
        // skip the resolution bit
        for ( ; byteIndex < bytes.length; byteIndex++ ) {
          if ( bytes[byteIndex] === 0x0A ) {
            byteIndex = byteIndex + 1;
            break;
          }
        }

        var dataIndex = 0;
        for ( var row = 0; row < height; row++ ) {
          for ( var col = 0; col < width; col++ ) {
            var r = bytes[byteIndex++];
            var g = bytes[byteIndex++];
            var b = bytes[byteIndex++];
            var e = bytes[byteIndex++];
            var exponentFactor = Math.pow( 2, e - 128 );
            data[dataIndex++] = ( r / 256 ) * exponentFactor;
            data[dataIndex++] = ( g / 256 ) * exponentFactor;
            data[dataIndex++] = ( b / 256 ) * exponentFactor;
          }
        }

        var floatTexture = tess.createRawHDRTexture( gl, data, width, height, flip, format );

        callback( floatTexture );
      } else {
        // TODO: better error handling
        callback( null );
      }
    };
    req.send( null );
  };

  /*---------------------------------------------------------------------------*
  * ShaderProgram
  *----------------------------------------------------------------------------*/

  tess.ShaderProgram = function ShaderProgram( gl, vertexSource, fragmentSource, attributeNames, uniformNames ) {
    // store parameters so that we can recreate the shader program on context loss
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.attributeNames = attributeNames;
    this.uniformNames = uniformNames;

    this.initialize( gl );
  }

  tess.ShaderProgram.prototype = {
    constructor: tess.ShaderProgram,

    // initializes (or reinitializes) the WebGL state and uniform/attribute references.
    initialize: function( gl ) {
      var self = this;
      this.gl = gl; // TODO: create them with separate contexts

      this.used = false;

      this.program = this.gl.createProgram();

      this.vertexShader = tess.createShader( this.vertexSource, this.gl.VERTEX_SHADER );
      this.fragmentShader = tess.createShader( this.fragmentSource, this.gl.FRAGMENT_SHADER );

      this.gl.attachShader( this.program, this.vertexShader );
      this.gl.attachShader( this.program, this.fragmentShader );

      this.gl.linkProgram( this.program );

      if( !this.gl.getProgramParameter( this.program, this.gl.LINK_STATUS ) ) {
        console.log( this.gl.getProgramInfoLog( this.program ) );
        console.log( this.vertexSource );
        console.log( this.fragmentSource );
        throw new Error( 'GLSL link error: ' + this.gl.getProgramInfoLog( this.program ) + '\n for vertex shader:\n' + this.vertexSource + '\n\n for fragment shader:\n' + this.fragmentSource );
      }

      this.gl.deleteShader( this.vertexShader );
      this.gl.deleteShader( this.fragmentShader );

      this.uniformLocations = {}; // map name => uniform location for program
      this.attributeLocations = {}; // map name => attribute location for program
      this.activeAttributes = {}; // map name => boolean (enabled)

      _.each( this.attributeNames, function( attributeName ) {
        self.attributeLocations[attributeName] = self.gl.getAttribLocation( self.program, attributeName );
        self.activeAttributes[attributeName] = true; // default to enabled
      } );
      _.each( this.uniformNames, function( uniformName ) {
        self.uniformLocations[uniformName] = self.gl.getUniformLocation( self.program, uniformName );
      } );

      this.isInitialized = true;
    },

    use: function() {
      if ( this.used ) { return; }

      var self = this;

      this.used = true;

      this.gl.useProgram( this.program );

      // enable the active attributes
      _.each( this.attributeNames, function( attributeName ) {
        if ( self.activeAttributes[attributeName] ) {
          self.gl.enableVertexAttribArray( self.attributeLocations[attributeName] );
        }
      } );
    },

    unuse: function() {
      if ( !this.used ) { return; }

      var self = this;

      this.used = false;

      _.each( this.attributeNames, function( attributeName ) {
        if ( self.activeAttributes[attributeName] ) {
          self.gl.disableVertexAttribArray( self.attributeLocations[attributeName] );
        }
      } );
    },

    activateAttribute: function( name ) {
      // guarded so we don't enable twice
      if ( !this.activeAttributes[name] ) {
        this.activeAttributes[name] = true;

        if ( this.used ) {
          this.gl.enableVertexAttribArray( this.attributeLocations[name] );
        }
      }
    },

    deactivateAttribute: function( name ) {
      // guarded so we don't disable twice
      if ( this.activeAttributes[name] ) {
        this.activeAttributes[name] = false;

        if ( this.used ) {
          this.gl.disableVertexAttribArray( this.attributeLocations[name] );
        }
      }
    },

    dispose: function() {
      this.gl.deleteProgram( this.program );
    }
  };

  /*---------------------------------------------------------------------------*
  * Program switching
  *----------------------------------------------------------------------------*/

  var currentProgram = null;
  function switchToProgram( program ) {
    if ( program !== currentProgram ) {
      currentProgram && currentProgram.unuse();
      program.use();

      currentProgram = program;
    }
  }

  /*---------------------------------------------------------------------------*
  * Textured quad shader program
  *----------------------------------------------------------------------------*/

  // draw a textured quad
  tess.textureQuadGammaProgram = new tess.ShaderProgram( gl,
    // vertex shader
    'attribute vec3 vertex;\n' +
    'varying vec2 texCoord;\n' +
    'void main() {\n' +
    '  texCoord = vertex.xy * 0.5 + 0.5;\n' +
    '  gl_Position = vec4( vertex, 1 );\n' +
    '}',

    // fragment shader
    'precision highp float;\n' +
    'varying vec2 texCoord;\n' +
    'uniform sampler2D texture;\n' +
    'uniform float brightness;\n' +
    'void main() {\n' +
    '  gl_FragColor = texture2D( texture, texCoord );\n' +
    '  gl_FragColor.rgb = brightness * pow( abs( gl_FragColor.rgb ), vec3( 1.0 / 2.2 ) );\n' + // gamma correction
    '}',

    ['vertex'], ['texture', 'brightness'] );

  // draw a textured quad
  tess.textureQuadReinhardProgram = new tess.ShaderProgram( gl,
    // vertex shader
    'attribute vec3 vertex;\n' +
    'varying vec2 texCoord;\n' +
    'void main() {\n' +
    '  texCoord = vertex.xy * 0.5 + 0.5;\n' +
    '  gl_Position = vec4( vertex, 1 );\n' +
    '}',

    // fragment shader
    'precision highp float;\n' +
    'varying vec2 texCoord;\n' +
    'uniform sampler2D texture;\n' +
    'uniform float brightness;\n' +
    'void main() {\n' +
    '  gl_FragColor = texture2D( texture, texCoord );\n' +
    '  gl_FragColor.rgb = gl_FragColor.rgb / ( 1.0 + gl_FragColor.rgb );\n' +
    '  gl_FragColor.rgb = brightness * pow( abs( gl_FragColor.rgb ), vec3( 1.0 / 2.2 ) );\n' + // gamma correction
    '}',

    ['vertex'], ['texture', 'brightness'] );

  // draw a textured quad
  tess.textureQuadFilmicProgram = new tess.ShaderProgram( gl,
    // vertex shader
    'attribute vec3 vertex;\n' +
    'varying vec2 texCoord;\n' +
    'void main() {\n' +
    '  texCoord = vertex.xy * 0.5 + 0.5;\n' +
    '  gl_Position = vec4( vertex, 1 );\n' +
    '}',

    // fragment shader
    'precision highp float;\n' +
    'varying vec2 texCoord;\n' +
    'uniform sampler2D texture;\n' +
    'uniform float brightness;\n' +
    'void main() {\n' +
    // based on notes in http://filmicgames.com/archives/75
    '  vec3 color = texture2D( texture, texCoord ).rgb * pow( abs( brightness ), 2.2 );\n' +
    '  vec3 x = max( color - 0.004, 0.0 );\n' +
    '  gl_FragColor = vec4( ( x * ( 6.2 * x + 0.5 ) ) / ( x * ( 6.2 * x + 1.7 ) + 0.06 ), 1.0 );\n' +
    '}',

    ['vertex'], ['texture', 'brightness'] );

  /*---------------------------------------------------------------------------*
  * Monte-carlo texture integration
  *----------------------------------------------------------------------------*/

  // uniformCallback( sampleProgram ) will be called, uniforms should be set based on the program's locations
  // sampleProgram should include the following uniforms:
  // - previousTexture (accumulated data to be blended)
  // - weight (how much of the previous texture should be used, vs fresh content)
  // - time (for randomness)
  // - size (of texture)
  // and the 'vertex' attribute in the vertex shader
  tess.TextureIntegrator = function TextureIntegrator( sampleProgram, uniformCallback, size ) {
    this.sampleProgram = sampleProgram;
    this.uniformCallback = uniformCallback;
    this.size = size;
    this.quadProgram = tess.textureQuadGammaProgram;

    this.startTime = Date.now(); // used for passing in a uniform time for randomness

    this.initialize();
  };

  tess.TextureIntegrator.prototype = {
    constructor: tess.TextureIntegrator,

    initialize: function() {
      var self = this;

      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer( gl.ARRAY_BUFFER, this.vertexBuffer );
      gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( [
        -1, -1,
        -1, +1,
        +1, -1,
        +1, +1
      ] ), gl.STATIC_DRAW );

      this.framebuffer = gl.createFramebuffer();

      var type = gl.getExtension( 'OES_texture_float' ) ? gl.FLOAT : gl.UNSIGNED_BYTE;

      function makeTexture() {
        var texture = gl.createTexture();
        gl.bindTexture( gl.TEXTURE_2D, texture );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGB, self.size, self.size, 0, gl.RGB, type, null );
        gl.bindTexture( gl.TEXTURE_2D, null );
        return texture;
      }

      this.currentTexture = makeTexture();
      this.previousTexture = makeTexture();

      this.samples = 0;
      this.brightness = 1;
    },

    dispose: function() {
      gl.deleteBuffer( this.vertexBuffer );
      gl.deleteFramebuffer( this.framebuffer );
      gl.deleteTexture( this.currentTexture );
      gl.deleteTexture( this.previousTexture );
    },

    clear: function() {
      this.samples = 0;
    },

    swap: function() {
      var tex = this.previousTexture;
      this.previousTexture = this.currentTexture;
      this.currentTexture = tex;
    },

    step: function() {
      this.swap();

      switchToProgram( this.sampleProgram );

      // update uniforms specific to the sampler
      this.uniformCallback( this.sampleProgram );

      gl.uniform1f( this.sampleProgram.uniformLocations.time, ( Date.now() - this.startTime + Math.random() ) % 17364.25434 );
      gl.uniform1f( this.sampleProgram.uniformLocations.weight, this.samples / ( this.samples + 1 ) );
      gl.uniform1f( this.sampleProgram.uniformLocations.size, this.size );
      gl.uniform1i( this.sampleProgram.uniformLocations.previousTexture, 0 );

      // render to texture
      gl.activeTexture( gl.TEXTURE0 );
      gl.bindTexture( gl.TEXTURE_2D, this.previousTexture );
      gl.bindBuffer( gl.ARRAY_BUFFER, this.vertexBuffer );
      gl.bindFramebuffer( gl.FRAMEBUFFER, this.framebuffer );
      gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.currentTexture, 0 );
      gl.vertexAttribPointer( this.sampleProgram.attributeLocations.vertex, 2, gl.FLOAT, false, 0, 0 );
      gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
      gl.bindFramebuffer( gl.FRAMEBUFFER, null );
      gl.bindTexture( gl.TEXTURE_2D, null );
      gl.bindTexture( gl.TEXTURE_CUBE_MAP, null );

      this.samples++;
    },

    render: function() {
      switchToProgram( this.quadProgram );

      gl.uniform1f( this.quadProgram.uniformLocations.brightness, this.brightness );

      gl.activeTexture( gl.TEXTURE0 );
      gl.bindTexture( gl.TEXTURE_2D, this.currentTexture );
      gl.bindBuffer( gl.ARRAY_BUFFER, this.vertexBuffer );
      gl.vertexAttribPointer( this.quadProgram.attributeLocations.vertex, 2, gl.FLOAT, false, 0, 0 );
      gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
      gl.bindTexture( gl.TEXTURE_2D, null );

    }
  };

  // calls name( vec2 uniform2d, float seed ) numSamples times per frame
  tess.createIntegratorProgram = function createIntegratorProgram( name, source, numSamples, uniforms ) {
    var integratorUniforms = ['time', 'weight', 'previousTexture','size'];
    if ( uniforms ) {
      integratorUniforms = integratorUniforms.concat( uniforms );
    }
    return new tess.ShaderProgram( gl,
      'attribute vec3 vertex;\n' +
      'varying vec2 texCoord;\n' +

      'void main(void) {\n' +
      '  texCoord = vertex.xy * 0.5 + 0.5;\n' +
      '  gl_Position = vec4( vertex, 1 );\n' +
      '}\n',

      // fragment shader
      'precision highp float;\n' +

      'varying vec2 texCoord;\n' +
      'uniform float time;\n' +
      'uniform float weight;\n' +
      'uniform float size;\n' +
      'uniform sampler2D previousTexture;\n' +

      source + '\n' +

      'void main( void ) {\n' +
      '  vec4 previous = vec4( texture2D( previousTexture, gl_FragCoord.xy / size ).rgb, 1 );\n' +
      '  vec4 sample = vec4(0);\n' +
      '  for( int i = 0; i < ' + numSamples + '; i++) {\n' +
      '    sample = sample + ' + name + '( texCoord, time + float(i) );\n' +
      '  }\n' +
      '  gl_FragColor = mix( sample / ' + tess.toFloat( numSamples ) + ', previous, weight );\n' +
      '}\n',

      ['vertex'], integratorUniforms );
  }
})();

