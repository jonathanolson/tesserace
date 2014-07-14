/*
 * 3D Scene handling
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

(function() {
  var snippets = tess.snippets;

  // input: rotationMatrix, pJittered. output: rayDir, rayPos. modifiable: p

  tess.PerspectiveRays = function PerspectiveRays() {

  };
  tess.PerspectiveRays.prototype = {
    constructor: tess.PerspectiveRays,
    preamble: '',
    computeRayDir: '  vec3 rayDir = rotationMatrix * normalize( vec3( pJittered, 1.0 ) );\n',
    requiredSnippets: [],
    uniforms: [],
    update: function( program ) {

    }
  };

  tess.PerspectiveDepthRays = function PerspectiveDepthRays( focalLength, dofSpread ) {
    this.focalLength = focalLength === undefined ? 33.0 : focalLength;
    this.dofSpread = dofSpread === undefined ? 0.3 : dofSpread;
  };
  tess.PerspectiveDepthRays.prototype = {
    constructor: tess.PerspectiveDepthRays,
    preamble:
      'uniform float focalLength;\n' +
      'uniform float dofSpread;\n',
    computeRayDir: '' +
      // '  float focalLength = 1.0 / 0.03;\n' +
      // '  float dofSpread = 0.3;\n' +
      '  vec2 dofOffset = dofSpread * uniformInsideDisk( pseudorandom(seed * 92.72 + 2.9), pseudorandom(seed * 192.72 + 12.9) );\n' +
      '  vec3 rayDir = rotationMatrix * normalize( vec3( pJittered - dofOffset / focalLength, 1.0 ) );\n' +
      '  rayPos = rayPos + rotationMatrix * vec3( dofOffset, 0.0 );\n',
    requiredSnippets: [snippets.uniformInsideDisk],
    uniforms: ['focalLength', 'dofSpread'],
    update: function( program ) {
      program.gl.uniform1f( program.uniformLocations.focalLength, this.focalLength );
      program.gl.uniform1f( program.uniformLocations.dofSpread, this.dofSpread );
    },
    getRayDir: function( rotationMatrix, p ) {
      return rotationMatrix.timesVector3( dot( p.x, p.y, 1 ) );
    }
  };

  tess.StereographicRays = function StereographicRays() {

  };
  tess.StereographicRays.prototype = {
    constructor: tess.StereographicRays,
    preamble: '',
    computeRayDir: '' +
      '  p = pJittered * 5.0;\n' +
      '  vec3 rayDir = rotationMatrix * normalize( vec3( 2.0 * p.x, 2.0 * p.y, 1.0 - p.x * p.x - p.y * p.y ) );\n',
    requiredSnippets: [],
    uniforms: [],
    update: function( program ) {

    },
    getRayDir: function( rotationMatrix, p ) {
      return rotationMatrix.timesVector3( dot( 2 * p.x, 2 * p.y, 1 - p.x * p.x - p.y * p.y ).normalized() );
    }
  };

  tess.OrthographicRays = function OrthographicRays() {

  };
  tess.OrthographicRays.prototype = {
    constructor: tess.OrthographicRays,
    preamble: '',
    computeRayDir: '' +
      '  vec3 rayDir = rotationMatrix * vec3( 0.0, 0.0, 1.0 );\n' +
      '  rayPos = rayPos + rotationMatrix * vec3( pJittered, 0.0 ) * 90.0;\n',
    requiredSnippets: [],
    uniforms: [],
    update: function( program ) {

    }
  };

  tess.ProceduralEnvironment = function ProceduralEnvironment( source, snippets ) {
    this.source = source;
    this.uniforms = [];
    this.requiredSnippets = snippets;
  };
  tess.ProceduralEnvironment.prototype = {
    constructor: tess.ProceduralEnvironment,

    update: function( program ) {

    },

    getPreamble: function() {
      return '';
    },

    getEnvironmentExpression: function() {
      return this.source;
    }
  };

  tess.TextureEnvironment = function TextureEnvironment( envTexture, type, multiplier, initialRotation, isHalf ) {
    this.envTexture = envTexture;
    this.type = type;
    this.multiplier = multiplier;
    this.rotation = initialRotation;
    this.isHalf = isHalf;

    this.uniforms = ['envTexture','envRotation'];
  };
  tess.TextureEnvironment.prototype = {
    constructor: tess.TextureEnvironment,

    requiredSnippets: [
      snippets.PI,
      snippets.TWO_PI
    ],

    update: function( program ) {
      program.gl.activeTexture( program.gl.TEXTURE1 );
      program.gl.bindTexture( program.gl.TEXTURE_2D, this.envTexture );
      program.gl.uniform1i( program.uniformLocations.envTexture, 1 );

      program.gl.uniform1f( program.uniformLocations.envRotation, this.rotation );
    },

    getPreamble: function() {
      return 'uniform sampler2D envTexture;\n' +
             'uniform float envRotation;\n';
    },

    getEnvironmentExpression: function() {
      var textureLookup;

      if ( this.type === 'rectilinear' ) {
        var coord = 'vec2( -atan( rayDir.z, rayDir.x ) / TWO_PI + 0.5 + envRotation, ( 0.5 - asin( rayDir.y ) / PI ) ' + ( this.isHalf ? ' * 2.0' : '' ) + ' )';
        textureLookup = 'texture2D( envTexture, ' + coord + ' ).rgb';
      } else if ( this.type === 'cubemap' ) {
        // TODO: rotation?
        textureLookup = 'textureCube( envTexture, rayDir ).rgb';
      }
      return '      accumulation = accumulation + attenuation * ' + textureLookup + ' * ' + tess.toFloat( this.multiplier ) + ';\n';
    }
  };

  tess.create2SceneProgram = function create2SceneProgram( obs, projection, environment, bounces ) {
    var numObs = obs.length, i;

    this.obs = obs;

    // get a list of all of the material types that we need to process with bounceType
    var materials = [];
    var materialPrototypes = [];
    var materialPrototypesPassed = {};
    function recordMaterial( material ) {
      if ( !materialPrototypesPassed[material.processId] ) {
        materialPrototypesPassed[material.processId] = true;
        materialPrototypes.push( material.constructor.prototype );
      }
      // check for required extra materials (used for composite materials, etc.)
      for ( var k = 0; k < material.requiredMaterials.length; k++ ) {
        recordMaterial( material.requiredMaterials[k] );
      }
      materials.push( material );
    }
    for ( i = 0; i < numObs; i++ ) {
      recordMaterial( obs[i].material );
    }

    var source = '' +
      'uniform mat3 rotationMatrix;\n' +
      'uniform vec3 cameraPosition;\n' +
      'const float infty = 60000.0;\n';

    source += environment.getPreamble();

    for ( i = 0; i < numObs; i++ ) {
      source += obs[i].getPreamble();
    }
    for ( i = 0; i < materials.length; i++ ) {
      source += materials[i].getPreamble();
    }
    source += projection.preamble;

    // for creating slices!
    var nm = 1;

    source +=
      snippets.pseudorandom.toString() + '\n' +
      // TODO: dot-weighted fresnel?
      'vec4 sampleXY( vec2 p, float seed ) {\n' +
      '  vec3 rayPos = cameraPosition;\n' +
      ( nm === 1 ? '' : '  rayPos = rayPos + rotationMatrix * vec3( 0, 0, 1.0 ) * (- 4.0 + 8.0 / ' + tess.toFloat( nm ) + ' * ( ' + tess.toFloat( nm ) + ' * floor( p.y * ' + tess.toFloat( nm ) + ' ) + floor( p.x * ' + tess.toFloat( nm ) + ' ) ) );\n' ) +
      ( nm === 1 ? '' : '  p = ' + tess.toFloat( nm ) + ' * mod( p, 1.0 / ' + tess.toFloat( nm ) + ' );\n' ) +
      '  vec2 pJittered = ( p + ( vec2( pseudorandom(seed * 34.16 + 2.6), pseudorandom(seed * 117.13 + 0.26) ) - 0.5 ) * ' + tess.toFloat( nm ) + ' / size ) - 0.5;\n' +
      // option for bloom-like shader
      // '  vec2 pJittered = ( p + ( 1.0 + pow( pseudorandom(seed * 134.16 + 12.6), 6.0 ) * 20.0 ) * ( vec2( pseudorandom(seed * 34.16 + 2.6), pseudorandom(seed * 117.13 + 0.26) ) - 0.5 ) * ' + tess.toFloat( nm ) + ' / size ) - 0.5;\n' +
      projection.computeRayDir +
      '  vec3 attenuation = vec3( 1 );\n' +
      '  vec3 accumulation = vec3( 0 );\n' +
      '  float ior = ' + tess.airIOR + ';\n' + // index of refraction
      '  float iorNext;\n' +
      // TODO: wavelength handling on/off?
      '  vec3 normal;\n' +
      '  vec3 hitPos;\n' +
      '  bool inside = false;\n' +
      '  int bounceType;\n';
    for ( i = 0; i < materialPrototypes.length; i++ ) {
      source += materialPrototypes[i].getLocals();
    }

    source +=
      '  for( int bounce = 0; bounce < ' + bounces + '; bounce++ ) {\n' +
      '    int hitObject = 0;\n' +
      '    float t = infty;\n';
      '    inside = false;\n';

    for ( i = 0; i < numObs; i++ ) {
      source +=
        '    ' + obs[i].getIntersectionExpressionType() + ' ' + obs[i].prefix + 'hit = ' + obs[i].getIntersectionExpression( 'rayPos', 'rayDir' ) + ';\n';
    }

    for ( i = 0; i < numObs; i++ ) {
      source +=
        '    if ( ' + obs[i].getValidIntersectionCheck( obs[i].prefix + 'hit' ) + ' && ' + obs[i].getT( obs[i].prefix + 'hit' ) + ' < t ) {\n' +
        '      t = ' + obs[i].getT( obs[i].prefix + 'hit' ) + ';\n' +
        '      hitObject = ' + obs[i].id + ';\n' +
        '    }\n';
    }

    source +=
      '    hitPos = rayT( rayPos, rayDir, t );\n' +

      '    if ( t == infty ) {\n' +
      '      bounceType = 0;\n';

    for ( i = 0; i < numObs; i++ ) {
      source +=
        '    } else if ( hitObject == ' + obs[i].id + ' ) {\n';

      if ( obs[i].getInsideExpression ) {
        var insideExpression = obs[i].getInsideExpression( obs[i].prefix + 'hit' );
        if ( insideExpression !== 'false' ) {
          source +=
            '      inside = ' + obs[i].getInsideExpression( obs[i].prefix + 'hit' ) + ';\n';
        }
      }

      source +=
        '      normal = ' + obs[i].getNormal( obs[i].prefix + 'hit', 'hitPos', 'rayPos', 'rayDir' ) + ';\n' +
        obs[i].material.getHitStatements( 'hitPos', 'normal', 'rayPos', 'rayDir' );
    }

    source +=
      '    }\n' +

      // hit nothing, environment light
      '    if ( bounceType == 0 ) {\n' +
      environment.getEnvironmentExpression() +
      '      break;\n';

    for ( var k = 0; k < materialPrototypes.length; k++ ) {
      if ( materialPrototypes[k].processId !== undefined ) {
        source +=
          '    } else if ( bounceType == ' + materialPrototypes[k].processId + ' ) {\n' +
          materialPrototypes[k].getProcessStatements( obs );
      }
    }

    source +=
      '    }\n' +

      '  }\n' +
      '  \n' +
      '  return vec4( accumulation * 0.45, 1 );\n' +
      '  \n' +
      '}\n';

    // snippet dependencies
    var dependencies = [snippets.rayT];
    dependencies = dependencies.concat( environment.requiredSnippets );
    dependencies = dependencies.concat( projection.requiredSnippets );

    for ( i = 0; i < numObs; i++ ) {
      dependencies = dependencies.concat( obs[i].requiredSnippets );
    }
    for ( i = 0; i < materialPrototypes.length; i++ ) {
      dependencies = dependencies.concat( materialPrototypes[i].requiredSnippets );
    }

    // uniforms
    var uniforms = ['rotationMatrix', 'cameraPosition'];
    uniforms = uniforms.concat( environment.uniforms );
    uniforms = uniforms.concat( projection.uniforms );
    for ( i = 0; i < numObs; i++ ) {
      uniforms = uniforms.concat( obs[i].uniforms );
    }
    for ( i = 0; i < materials.length; i++ ) {
      uniforms = uniforms.concat( materials[i].uniforms );
    }

    return tess.createIntegratorProgram( 'sampleXY', new tess.Snippet( source, dependencies ).toString(), 5, uniforms );
  };

  // {Vector3} position, {Matrix3} rotation
  tess.Camera3 = function( position, rotationMatrix, updateCallback ) {
    this.position = position;
    this.rotationMatrix = rotationMatrix;
    this.updateCallback = updateCallback;

    this.downs = {};
  };
  tess.Camera3.prototype = {
    constructor: tess.Camera3,

    initializeKeyboardControl: function() {
      var camera = this;
      document.addEventListener( 'keydown', function( evt ) {
        camera.downs[evt.keyCode] = true;
        // console && console.log && console.log( evt.keyCode );

        // prevent scrolling
        if ( evt.keyCode === 40 || evt.keyCode === 38 ) {
          evt.preventDefault();
        }
      } );
      document.addEventListener( 'keyup', function( evt ) {
        camera.downs[evt.keyCode] = false;
      } );
    },

    step: function( timeElapsed ) {
      var speed = 1/15;

      // forward
      if ( this.downs[87] ) {
        this.position.add( this.rotationMatrix.timesVector3( new dot.Vector3( 0, 0, timeElapsed * speed ) ) );
        this.updateCallback();
      }

      // back
      if ( this.downs[83] ) {
        this.position.add( this.rotationMatrix.timesVector3( new dot.Vector3( 0, 0, -timeElapsed * speed ) ) );
        this.updateCallback();
      }

      // left strafe
      if ( this.downs[65] ) {
        this.position.add( this.rotationMatrix.timesVector3( new dot.Vector3( -timeElapsed * speed, 0, 0 ) ) );
        this.updateCallback();
      }

      // right strafe
      if ( this.downs[68] ) {
        this.position.add( this.rotationMatrix.timesVector3( new dot.Vector3( timeElapsed * speed, 0, 0 ) ) );
        this.updateCallback();
      }

      // left rotate
      if ( this.downs[37] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationY( -timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // right rotate
      if ( this.downs[39] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationY( timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // up rotate
      if ( this.downs[38] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationX( timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // down rotate
      if ( this.downs[40] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationX( -timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // CCW roll
      if ( this.downs[81] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationZ( timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // CW roll
      if ( this.downs[69] ) {
        this.rotationMatrix.multiplyMatrix( dot.Matrix3.rotationZ( -timeElapsed / 1000 ) );
        this.updateCallback();
      }

      // debug key             Z
      if ( this.downs[90] ) {
        console.log( this.position.toString() );
        console.log( this.rotationMatrix.toString() );
        // this.updateCallback();
      }

      // debug key              C
      if ( this.downs[67] ) {
        // this.updateCallback();
      }
    }
  }
} )();
