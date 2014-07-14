/*
 * 3D Materials (reflectance models)
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

(function() {
  var snippets = tess.snippets;

  // for individual materials
  var materialGlobalId = 1;

  // for types of materials
  var processGlobalId = 1;

  tess.Material = function Material() {
    this.id = materialGlobalId++;

    // list of uniform names used
    this.uniforms = [];
  };
  tess.Material.prototype = {
    constructor: tess.Material,

    // code snippets that need to be called from material code in GLSL
    requiredSnippets: [],

    // materials that need to be handlable in the render loop (useful for composite materials)
    requiredMaterials: [],

    /*---------------------------------------------------------------------------*
    * Code specific to the material instance (not type)
    *----------------------------------------------------------------------------*/

    // update uniforms on the shader program, and anything else necessary at that point
    update: function( program ) {

    },

    // code that is placed at the top level, including any functions or uniforms necessary
    getPreamble: function() {
      return ''; // default
    },

    // code that is called on the only object that is hit, with access to material-instance-specific bits (e.g. color for diffuse). needs to set bounceType
    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '';
    },

    /*---------------------------------------------------------------------------*
    * Code specific to the material type. Any instance variables (like colors) should be declared in getLocals(), and set in getHitStatements()
    *----------------------------------------------------------------------------*/

    // local variable declarations put into the sampling function that can be shared between hit statements and process statements
    getLocals: function() {
      return '';
    },

    // code that is called for the reflectance model of ANY material instance of this type. has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '';
    }
  };

  // ratioStatements should set the (already declared) variable ratio (probability of selecting material A)
  tess.SwitchedMaterial = function SwitchedMaterial( materialA, materialB, ratioStatements, snippets ) {
    tess.Material.call( this );

    this.materialA = materialA;
    this.materialB = materialB;
    this.ratioStatements = ratioStatements;
    this.requiredMaterials = [materialA, materialB];
    this.requiredSnippets = snippets;
  };
  core.inherit( tess.Material, tess.SwitchedMaterial, {
    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '' +
        '      float ratio;\n' +
        this.ratioStatements +
        '      if ( pseudorandom(float(bounce) + seed*1.7243 - float(' + this.id + ') ) < ratio ) {\n' +
        this.materialA.getHitStatements( hitPositionName, normalName, rayPosName, rayDirName ) +
        '      } else {\n' +
        this.materialB.getHitStatements( hitPositionName, normalName, rayPosName, rayDirName ) +
        '      }\n';
    }
  } );

  // statements should (for now) be function( hitPositionName, normalName, rayPosName, rayDirName ) => GLSL string
  tess.WrapperMaterial = function WrapperMaterial( material, statements, snippets ) {
    tess.Material.call( this );

    this.material = material;
    this.statements = statements;
    this.requiredMaterials = [material];
    this.requiredSnippets = snippets;
  };
  core.inherit( tess.Material, tess.WrapperMaterial, {
    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '' +
        this.statements( hitPositionName, normalName, rayPosName, rayDirName ) +
        this.material.getHitStatements( hitPositionName, normalName, rayPosName, rayDirName );
    }
  } );

  // constant (number) na, nb only for now
  tess.FresnelCompositeMaterial = function FresnelCompositeMaterial( reflectionMaterial, transmissionMaterial, na, nb ) {
    // TODO: transform into "function" so we can handle normal names correctly
    var ratioStatements = '' +
      '      vec2 fresnelIors = vec2( ' + tess.toFloat( na ) + ', ' + tess.toFloat( nb ) + ');\n' +
      '      if ( inside ) { fresnelIors = fresnelIors.yx; }\n' +
      '      if ( abs( dot( normal, rayDir ) ) < totalInternalReflectionCutoff( fresnelIors.x, fresnelIors.y ) + ' + tess.smallEpsilon + ' ) {\n' +
      '        ratio = 1.0;\n' +
      '      } else {;\n' +
      '        vec2 reflectance = fresnelDielectric( rayDir, normal, refract( rayDir, normal, fresnelIors.x / fresnelIors.y ), fresnelIors.x, fresnelIors.y );\n' +
      '        ratio = ( reflectance.x + reflectance.y ) / 2.0;\n' +
      '      }\n';
    tess.SwitchedMaterial.call( this, reflectionMaterial, transmissionMaterial, ratioStatements, [snippets.fresnelDielectric, snippets.totalInternalReflectionCutoff] );
  };
  core.inherit( tess.SwitchedMaterial, tess.FresnelCompositeMaterial );

  tess.Attenuate = function Attenuate( material, attenuation, isDynamic ) {
    var that = this;
    tess.WrapperMaterial.call( this, material, function( hitPositionName, normalName, rayPosName, rayDirName ) {
      if ( that.attenuationIsCustom ) {
        return '      attenuation = attenuation * ' + that.attenuation( hitPositionName, normalName, rayPosName, rayDirName ) + '\n';
      } else if ( !that.attenuationIsTrivial ) {
        if ( that.isDynamic ) {
          return '      attenuation = attenuation * ' + that.attenuationName + ';\n';
        } else {
          return '      attenuation = attenuation * ' + tess.toVec3( that.attenuation ) + ';\n';
        }
      } else {
        return '';
      }
    }, [] );

    this.isDynamic = isDynamic;
    this.attenuation = attenuation;
    this.attenuationIsCustom = ( typeof this.attenuation === 'function' );
    this.attenuationIsTrivial = !this.attenuationIsCustom && this.attenuation.equals( dot( 1, 1, 1 ) );
    this.attenuationName = 'attenuation' + this.id;
    this.uniforms = isDynamic ? [this.attenuationName] : [];
  };
  core.inherit( tess.WrapperMaterial, tess.Attenuate, {
    update: function( program ) {
      if ( this.isDynamic ) {
        if ( !this.attenuationIsCustom ) {
          program.gl.uniform3f( program.uniformLocations[this.attenuationName], this.attenuation.x, this.attenuation.y, this.attenuation.z );
        }
      }
    },

    getPreamble: function() {
      var result = '';

      if ( !this.attenuationIsCustom ) {
        if ( this.isDynamic ) {
          result += 'uniform vec3 ' + this.attenuationName + ';\n';
        } else if ( !this.attenuationIsTrivial && this.isDynamic ) {
          result += 'const vec3 ' + this.attenuationName + ' = ' + tess.toVec3( this.attenuation ) + ';\n';
        }
      }

      return result;
    }
  } );

  tess.Emit = function Emit( material, emission, isDynamic ) {
    var that = this;
    tess.WrapperMaterial.call( this, material, function( hitPositionName, normalName, rayPosName, rayDirName ) {
      if ( that.emissionIsCustom ) {
        return '      accumulation = accumulation + attenuation * ' + that.emission( hitPositionName, normalName, rayPosName, rayDirName ) + '\n';
      } else if ( !that.emissionIsTrivial ) {
        return '      accumulation = accumulation + attenuation * ' + that.emissionName + ';\n';
      } else {
        return '';
      }
    }, [] );

    this.isDynamic = isDynamic;
    this.emission = emission;
    this.emissionIsCustom = ( typeof this.emission === 'function' );
    this.emissionIsTrivial = !this.emissionIsCustom && this.emission.equals( dot.Vector3.ZERO );
    this.emissionName = 'emission' + this.id;
    this.uniforms = isDynamic ? [this.emissionName] : [];
  };
  core.inherit( tess.WrapperMaterial, tess.Emit, {
    update: function( program ) {
      if ( this.isDynamic ) {
        if ( !this.emissionIsCustom ) {
          program.gl.uniform3f( program.uniformLocations[this.emissionName], this.emission.x, this.emission.y, this.emission.z );
        }
      }
    },

    getPreamble: function() {
      var result = '';

      if ( !this.emissionIsCustom ) {
        if ( this.isDynamic ) {
          result += 'uniform vec3 ' + this.emissionName + ';\n';
        } else if ( !this.emissionIsTrivial ) {
          result += 'const vec3 ' + this.emissionName + ' = ' + tess.toVec3( this.emission ) + ';\n';
        }
      }

      return result;
    }
  } );

  tess.Diffuse = function Diffuse() {
    tess.Material.call( this );
  };
  core.inherit( tess.Material, tess.Diffuse, {
    processId: processGlobalId++,

    requiredSnippets: [snippets.sampleTowardsNormal3, snippets.sampleDotWeightOnHemiphere],

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      bounceType = ' + this.processId + ';\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      var result = '' + // TODO: abstract way to get a uniform random number, so that they are well distributed across program
        '      rayDir = sampleTowardsNormal3( normal, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5), pseudorandom(float(bounce) + 7.233 * seed + 1.3) ) );\n' +
        '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
      return result;
    }
  } );

  tess.Absorb = function Absorb() {
    tess.Material.call( this );
  };
  core.inherit( tess.Material, tess.Absorb, {
    processId: processGlobalId++,

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      bounceType = ' + this.processId + ';\n';
    },

    getProcessStatements: function( objects ) {
      return '      break;\n';
    }
  } );

  tess.Reflect = function Reflect() {
    tess.Material.call( this );
  };
  core.inherit( tess.Material, tess.Reflect, {
    processId: processGlobalId++,

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      bounceType = ' + this.processId + ';\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '      rayDir = reflect( rayDir, normal );\n' +
             '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  // Indices of refraction, na outside (towards normal), nb inside (away from normal). They should be either floats, or a string GLSL expression
  tess.Transmit = function Transmit( na, nb ) {
    tess.Material.call( this );

    this.na = na;
    this.nb = nb;

    this.naExpression = ( typeof this.na === 'number' ) ? tess.toFloat( this.na ) : this.na;
    this.nbExpression = ( typeof this.nb === 'number' ) ? tess.toFloat( this.nb ) : this.nb;
  };
  core.inherit( tess.Material, tess.Transmit, {
    processId: processGlobalId++,

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '' +
        '      transmitIORs = vec2(' + this.naExpression + ',' + this.nbExpression + ');\n' +
        '      if ( inside ) {\n' +
        '        transmitIORs = transmitIORs.yx;\n' +
        '      }\n' +
        '      bounceType = ' + this.processId + ';\n';
    },

    getLocals: function() {
      // TODO: consider a float ratio of IORs instead?
      return '  vec2 transmitIORs;\n'
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '      rayDir = refract( rayDir, normal, transmitIORs.x / transmitIORs.y );\n' +
             // handle the total internal reflection case somewhat gracefully by just exiting
             '      if ( dot( rayDir, rayDir ) == 0.0 ) { break; }\n' +
             '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  // n is either float, or function( hitPositionName, normalName, rayPosName, rayDirName ) => string (of the function)
  tess.PhongSpecular = function PhongSpecular( n, isDynamic ) {
    tess.Material.call( this );

    this.n = n;

    this.nIsCustom = ( typeof this.n === 'function' );

    this.nName = 'phongN' + this.id;

    this.uniforms = isDynamic ? [this.nName] : [];
  };
  core.inherit( tess.Material, tess.PhongSpecular, {
    processId: processGlobalId++,

    requiredSnippets: [snippets.sampleTowardsNormal3, snippets.sampleDotWeightOnHemiphere, snippets.TWO_PI],

    update: function( program ) {
      if ( this.isDynamic ) {
        if ( !this.nIsCustom ) {
          program.gl.uniform1f( program.uniformLocations[this.nName], this.n );
        }
      }
    },

    getPreamble: function() {
      var result = '';

      if ( !this.nIsCustom ) {
        if ( this.isDynamic ) {
          result += 'uniform float ' + this.nName + ';\n';
        } else {
          result += 'const float ' + this.nName + ' = ' + tess.toFloat( this.n ) + ';\n';
        }
      }

      return result;
    },

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      phongSpecularN = ' + this.nName + ';\n' +
             '      bounceType = ' + this.processId + ';\n';
    },

    getLocals: function() {
      return '  float phongSpecularN;\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      var result = '' +
        // get a sample direction weighted with dot(reflected,X)^n
        '      vec3 reflectDir = reflect( rayDir, normal );\n' +
        '      rayDir = sampleTowardsNormal3( reflectDir, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*1642.32+2.52), pseudorandom(float(bounce) + 72.233 * seed + 1.32) ) );\n' +
        // compute contribution based on normal cosine falloff (not included in sampled direction)
        '      float dotty = dot( reflectDir, rayDir );\n' +
        '      float contrib = pow( abs( dotty ), phongSpecularN ) * ( phongSpecularN + 2.0 ) / ( 2.0 );\n' +
        // if the contribution is negative, we sampled behind the surface (just ignore it, that part of the integral is 0)
        '      if ( dotty < 0.0 ) { break; }\n' +
        // weight this sample by its contribution
        '      attenuation = attenuation * contrib;\n' +
        '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
      return result;
    }
  } );

  // indexOfRefraction is either a number (constant), or a string expression to be evaluated in shader code.
  tess.SmoothDielectric = function SmoothDielectric( indexOfRefraction ) {
    tess.Material.call( this );

    this.ior = indexOfRefraction;
    this.iorIsConstant = ( typeof indexOfRefraction === 'number' );
  };
  core.inherit( tess.Material, tess.SmoothDielectric, {
    processId: processGlobalId++,

    requiredSnippets: [snippets.sellmeierDispersion, snippets.fresnelDielectric, snippets.totalInternalReflectionCutoff],

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      iorNext = inside ? ' + tess.airIOR + ' : ' + ( this.iorIsConstant ? tess.toFloat( this.ior ) : this.ior ) + ';\n' +
             '      bounceType = ' + this.processId + ';\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '' +
        // check for total internal reflection
        '      if ( abs( dot( normal, rayDir ) ) < totalInternalReflectionCutoff( ior, iorNext ) + ' + tess.smallEpsilon + ' ) {\n' +
        '        rayDir = reflect( rayDir, normal );\n' +
        '      } else {\n' +
        '        vec3 transmitDir = refract( rayDir, normal, ior / iorNext );\n' +
        '        vec2 reflectance = fresnelDielectric( rayDir, normal, transmitDir, ior, iorNext );\n' +
        '        if ( pseudorandom(float(bounce) + seed*1.7243 - 15.34) > ( reflectance.x + reflectance.y ) / 2.0 ) {\n' +
        // refract
        '          rayDir = transmitDir;\n' +
        '          ior = iorNext;\n' +
        '        } else {\n' +
        // reflect
        '          rayDir = reflect( rayDir, normal );\n' +
        '        }\n' +
        '      }\n' +
        '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  // TODO: remove duplication, figure out "layered" shaders, and allow dielectric underneath
  // indexOfRefraction is either a number (constant), or a string expression to be evaluated in shader code.
  tess.ShinyBlack = function ShinyBlack( indexOfRefraction ) {
    tess.Material.call( this );

    this.ior = indexOfRefraction;
    this.iorIsConstant = ( typeof indexOfRefraction === 'number' );
  };
  core.inherit( tess.Material, tess.ShinyBlack, {
    processId: processGlobalId++,

    requiredSnippets: [snippets.sellmeierDispersion, snippets.fresnelDielectric, snippets.totalInternalReflectionCutoff],

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      iorNext = inside ? ' + tess.airIOR + ' : ' + ( this.iorIsConstant ? tess.toFloat( this.ior ) : this.ior ) + ';\n' +
             '      bounceType = ' + this.processId + ';\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '' +
        // check for total internal reflection
        '      if ( abs( dot( normal, rayDir ) ) < totalInternalReflectionCutoff( ior, iorNext ) + ' + tess.smallEpsilon + ' ) {\n' +
        '        rayDir = reflect( rayDir, normal );\n' +
        '      } else {\n' +
        '        vec3 transmitDir = refract( rayDir, normal, ior / iorNext );\n' +
        '        vec2 reflectance = fresnelDielectric( rayDir, normal, transmitDir, ior, iorNext );\n' +
        '        attenuation = attenuation * ( reflectance.x + reflectance.y ) / 2.0;\n' +
        '        rayDir = reflect( rayDir, normal );\n' +
        '      }\n' +
        '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  // indexOfRefraction is either a vec2 (constant dot.Vector2), or a string expression to be evaluated in shader code returning vec2
  tess.Metal = function Metal( indexOfRefraction ) {
    tess.Material.call( this );

    this.ior = indexOfRefraction;
    this.iorIsConstant = ( indexOfRefraction instanceof dot.Vector2 );
  };
  core.inherit( tess.Material, tess.Metal, {
    processId: processGlobalId++,

    requiredSnippets: [snippets.fresnel],

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      iorComplex = ' + ( this.iorIsConstant ? tess.toVec2( this.ior ) : this.ior ) + ';\n' +
             '      bounceType = ' + this.processId + ';\n';
    },

    getLocals: function() {
      return '  vec2 iorComplex;\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      return '' +
        '      vec2 reflectance = fresnel( rayDir, normal, ior, iorComplex.x, iorComplex.y );\n' +
        '      attenuation = attenuation * ( reflectance.x + reflectance.y ) / 2.0;\n' +
        '      rayDir = reflect( rayDir, normal );\n' +
        '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  tess.OakFloor = function OakFloor( diffuseTexture, dirtTexture, normalTexture ) {
    tess.Material.call( this );
    this.diffuseTexture = diffuseTexture;
    this.dirtTexture = dirtTexture;
    this.normalTexture = normalTexture;

    this.uniforms = ['oakFloorDiffuse', 'oakFloorDirt', 'oakFloorNormal'];
  };
  core.inherit( tess.Material, tess.OakFloor, {
    processId: processGlobalId++,

    requiredSnippets: [
      snippets.fresnelDielectric,
      snippets.sampleDotWeightOnHemiphere,
      snippets.sampleTowardsNormal3,
      snippets.TWO_PI
    ],

    /*---------------------------------------------------------------------------*
    * Instance bits
    *----------------------------------------------------------------------------*/

    update: function( program ) {
        program.gl.activeTexture( program.gl.TEXTURE2 );
        program.gl.bindTexture( program.gl.TEXTURE_2D, this.diffuseTexture );
        program.gl.uniform1i( program.uniformLocations.oakFloorDiffuse, 2 );

        program.gl.activeTexture( program.gl.TEXTURE3 );
        program.gl.bindTexture( program.gl.TEXTURE_2D, this.dirtTexture );
        program.gl.uniform1i( program.uniformLocations.oakFloorDirt, 3 );

        program.gl.activeTexture( program.gl.TEXTURE4 );
        program.gl.bindTexture( program.gl.TEXTURE_2D, this.normalTexture );
        program.gl.uniform1i( program.uniformLocations.oakFloorNormal, 4 );
    },

    getPreamble: function() {
      return 'uniform sampler2D oakFloorDiffuse;\n' +
             'uniform sampler2D oakFloorDirt;\n' +
             'uniform sampler2D oakFloorNormal;\n';
    },

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      bounceType = ' + this.processId + ';\n';
    },

    /*---------------------------------------------------------------------------*
    * Material bits
    *----------------------------------------------------------------------------*/

    getLocals: function() {
      return '';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      var overgamma = '2.2';
      var ior = '1.5';
      var texScale = '0.003937007874015748';
      var texCoord = 'hitPos.xz * ' + texScale;
      var phongSpecularN = '50.0';
      return '' +
             '      bool inside = abs( hitPos.x ) <= 350.0 && abs( hitPos.z ) <= 350.0;\n' +
             '      if ( inside ) {\n' +
             '        vec3 fakeNormal = normalize( texture2D( oakFloorNormal, ' + texCoord + ' ).rbg * 2.0 - 1.0 );\n' +
             '        vec3 diffuseTex = pow( abs( texture2D( oakFloorDiffuse, ' + texCoord + ' ).rgb ), vec3( ' + overgamma + ' ) );\n' +
             '        if ( dot( fakeNormal, rayDir ) > 0.0 ) { fakeNormal = normal; }\n' +
             '        vec3 transmitDir = refract( rayDir, normal, 1.0 / ' + ior + ' );\n' +
             '        vec2 reflectance = fresnelDielectric( rayDir, normal, transmitDir, 1.0, ' + ior + ' );\n' +
             '        bool didReflect = false;\n' +
             '        if ( pseudorandom(float(bounce) + seed*1.17243 - 2.3 ) < ( reflectance.x + reflectance.y ) / 2.0 ) {\n' +
             '          vec3 dirtTex = pow( abs( texture2D( oakFloorDirt, ' + texCoord + ' ).rgb ), vec3( ' + overgamma + ' ) ) * 0.4 + 0.6;\n' +
             '          attenuation = attenuation * dirtTex * ( pow( abs( diffuseTex.g ), 1.0 / ' + overgamma + ' ) );\n' +
             '          vec3 reflectDir = reflect( rayDir, fakeNormal );\n' +
             '          rayDir = sampleTowardsNormal3( reflectDir, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*1642.32+2.52 - 2.3), pseudorandom(float(bounce) + 72.233 * seed + 1.32 - 2.3) ) );\n' +
             '          if ( rayDir.y > 0.0 ) {\n' +
             '            didReflect = true;\n' +
             '            float reflectDot = dot( reflectDir, rayDir );\n' +
             '            if ( reflectDot < 0.0 ) { break; }\n' +
             // compute contribution based on normal cosine falloff (not included in sampled direction)
             '            float contrib = pow( abs( reflectDot ), ' + phongSpecularN + ' ) * ( ' + phongSpecularN + ' + 2.0 ) / ( 2.0 );\n' +
             // if the contribution is negative, we sampled behind the surface (just ignore it, that part of the integral is 0)
             // weight this sample by its contribution
             '            attenuation = attenuation * contrib;\n' +
             '          }\n' +
             '        }\n' +
             '        if ( !didReflect ) {\n' +
             '          attenuation = attenuation * diffuseTex;\n' +
             '          rayDir = sampleTowardsNormal3( fakeNormal, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5) - 2.3, pseudorandom(float(bounce) + 7.233 * seed + 1.3 - 2.3) ) );\n' +
             '          if ( rayDir.y < 0.0 ) { rayDir.y = -rayDir.y; };\n' +
             '        }\n' +
             '      } else {\n' +
             '        attenuation = attenuation * pow( vec3( 74.0, 112.0, 25.0 ) / 255.0, vec3( 1.0 / 2.2 ) ) * 0.5;\n' +
             '        rayDir = sampleTowardsNormal3( normal, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5) - 2.3, pseudorandom(float(bounce) + 7.233 * seed + 1.3 - 2.3) ) );\n' +
             '      }\n' +
             '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );

  tess.SoccerMaterial = function SoccerMaterial() {
    tess.Material.call( this );
  };
  core.inherit( tess.Material, tess.SoccerMaterial, {
    processId: processGlobalId++,

    requiredSnippets: [
      snippets.sampleDotWeightOnHemiphere,
      snippets.sampleTowardsNormal3,
      snippets.closestIcosahedronPoint,
      snippets.closestDodecahedronPoint,
      snippets.PHI,
      snippets.INV_PHI,
      snippets.HALF_PI,
      snippets.SQRT_5,
      snippets.INV_2_SQRT_2
    ],

    getHitStatements: function( hitPositionName, normalName, rayPosName, rayDirName ) {
      return '      bounceType = ' + this.processId + ';\n';
    },

    // has normal, bounce, etc. available
    getProcessStatements: function( objects ) {
      var ior = '1.4';
      var phongSpecularN = '30.0';
      return '' +
             '      vec3 ico = closestIcosahedronPoint( normal );\n' +
             '      vec3 dodeca = closestDodecahedronPoint( normal );\n' +
             '      vec3 crossed = cross( ico, dodeca );\n' +
             '      vec3 fakeNormal;\n' +
             '      vec3 tileNormal = INV_2_SQRT_2 * ( SQRT_5 * ico - PHI * PHI * dodeca );\n' +
             '      vec3 boundaryNormal1 = 0.25 * ( PHI * ico - SQRT_5 * dodeca + PHI * crossed );\n' +
             '      vec3 boundaryNormal2 = 0.25 * ( PHI * ico - SQRT_5 * dodeca - PHI * crossed );\n' +
             '      float edgeCloseness = abs( dot( tileNormal, normal ) + 0.07 );\n' +
             '      bool isInBlack = dot( tileNormal, normal ) > -0.07;\n' +
             '      vec3 stitchDir = boundaryNormal1 - boundaryNormal2;\n' +
             '      if ( !isInBlack ) {\n' +
             '        float b1 = abs( dot( boundaryNormal1, normal ) );\n' +
             '        float b2 = abs( dot( boundaryNormal2, normal ) );\n' +
             '        if ( b1 < edgeCloseness ) {\n' +
             '          edgeCloseness = b1;\n' +
             '          stitchDir = ico - ( -0.5 * ico + (PHI + 1.0) / 2.0 * dodeca + 0.5 * crossed );\n' +
             '        }\n' +
             '        if ( b2 < edgeCloseness ) {\n' +
             '          edgeCloseness = b2;\n' +
             '          stitchDir = ico - ( -0.5 * ico + (PHI + 1.0) / 2.0 * dodeca - 0.5 * crossed );\n' +
             '        }\n' +
             '      }\n' +
             '      float edgeFactor = edgeCloseness > 0.04 ? 0.0 : ( ( 0.92 + 0.08 * sin( 200.0 * dot( normal, stitchDir ) ) ) * ( 1.0 + cos( edgeCloseness / 0.04  * HALF_PI + HALF_PI ) ) );\n' +
             '      float faceFactor = max( 0.0, 0.3 - edgeCloseness / 0.5 );\n' +
             '      fakeNormal = normalize( normal - ( 0.5 * edgeFactor * edgeFactor + faceFactor ) * ( isInBlack ? ico : dodeca ) );\n' +
             '      vec3 transmitDir = refract( rayDir, fakeNormal, 1.0 / ' + ior + ' );\n' +
             '      vec2 reflectance = fresnelDielectric( rayDir, fakeNormal, transmitDir, 1.0, ' + ior + ' );\n' +
             '      bool didReflect = false;\n' +
             '      if ( pseudorandom(float(bounce) + seed*1.17243 - 2.3 ) < ( reflectance.x + reflectance.y ) / 2.0 ) {\n' +
             '        vec3 reflectDir = reflect( rayDir, fakeNormal );\n' +
             '        rayDir = sampleTowardsNormal3( reflectDir, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5) - 2.3, pseudorandom(float(bounce) + 7.233 * seed + 1.3 - 2.3) ) );\n' +
             '        if ( dot( rayDir, normal ) > 0.0 ) {\n' +
             '          float reflectDot = dot( reflectDir, rayDir );\n' +
             '          if ( reflectDot < 0.0 ) { break; }\n' +
             '          float contrib = pow( abs( reflectDot ), ' + phongSpecularN + ' ) * ( ' + phongSpecularN + ' + 2.0 ) / ( 2.0 );\n' +
             '          attenuation = attenuation * contrib;\n' +
             '          didReflect = true;\n' +
             '        };\n' +
             '      }\n' +
             '      if ( !didReflect ) {\n' +
             '        if ( isInBlack ) {\n' +
             '          attenuation = attenuation * 0.05;\n' +
             '        }\n' +
             '        attenuation = attenuation * ( 1.0 - 0.7 * pow( abs( edgeFactor ), 7.0 ) );\n' +
             '        rayDir = sampleTowardsNormal3( fakeNormal, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5), pseudorandom(float(bounce) + 7.233 * seed + 1.3) ) );\n' +
             '        if ( edgeFactor >= 1.0 ) {\n' +
             '          attenuation = attenuation * 0.1;\n' +
             '          rayDir = sampleTowardsNormal3( normal, sampleDotWeightOnHemiphere( pseudorandom(float(bounce) + seed*164.32+2.5), pseudorandom(float(bounce) + 7.233 * seed + 1.3) ) );\n' +
             '        }\n' +
             '      }\n' +
             '      rayPos = hitPos + ' + tess.epsilon + ' * rayDir;\n';
    }
  } );
})();
